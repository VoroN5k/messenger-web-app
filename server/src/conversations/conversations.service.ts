import {
    BadRequestException, ConflictException, ForbiddenException,
    Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { validateAndNormalizeMetadata } from './metadata.validator.js';
import { UploadService } from '../upload/upload.service.js';
import { ReactionUser } from './interfaces/reactionUser.interface.js';

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const ALLOWED_EMOJIS = ['👍','❤️','😂','😮','😢','😡','🔥','👏','🎉','💯'];
const MAX_PINNED_MESSAGES = 20;

const MSG_SELECT = {
    id: true, content: true, createdAt: true, editedAt: true, deletedAt: true,
    fileUrl: true, fileName: true, fileType: true, fileSize: true,
    metadata: true, scheduledAt: true,
    senderId: true, conversationId: true, replyToId: true,
    forwardedFromId: true, forwardedFromUser: true,
    sender: { select: { id: true, nickname: true, avatarUrl: true } },
    replyTo: {
        select: {
            id: true, content: true, deletedAt: true,
            sender: { select: { id: true, nickname: true } },
        },
    },
    forwardedFrom: {
        select: {
            id: true, content: true, fileType: true,
            sender: { select: { id: true, nickname: true } },
        },
    },
    reactions: {
        select: {
            emoji: true, userId: true,
            user: { select: { id: true, nickname: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' as const },
    },
};

const MEMBER_USER_SELECT = {
    id: true, nickname: true, avatarUrl: true, isOnline: true, lastSeen: true,
};

@Injectable()
export class ConversationsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly upload: UploadService,
    ) {}

    // Helpers

    private groupReactions(reactions: Array<{ emoji: string; userId: number; user: ReactionUser }>) {
        const map = new Map<string, { userIds: number[]; users: ReactionUser[] }>();
        for (const r of reactions) {
            const slot = map.get(r.emoji) ?? { userIds: [], users: [] };
            slot.userIds.push(r.userId);
            slot.users.push(r.user);
            map.set(r.emoji, slot);
        }
        return Array.from(map.entries()).map(([emoji, slot]) => ({
            emoji, count: slot.userIds.length, userIds: slot.userIds, users: slot.users,
        }));
    }

    private mapMessage(msg: any) {
        const { reactions, ...rest } = msg;
        return { ...rest, reactions: this.groupReactions(reactions) };
    }

    private mapMessageWithRead(
        msg: any,
        currentUserId: number,
        otherMembersLastRead: Map<number, { lastReadAt: Date; nickname: string }>,
    ) {
        const { reactions, ...rest } = msg;
        const msgTime = new Date(rest.createdAt).getTime();
        let isRead = false;
        const readBy: { userId: number; nickname: string }[] = [];
        for (const [uid, { lastReadAt, nickname }] of otherMembersLastRead.entries()) {
            if (lastReadAt.getTime() >= msgTime) {
                readBy.push({ userId: uid, nickname });
                if (String(rest.senderId) === String(currentUserId)) isRead = true;
            }
        }
        if (String(rest.senderId) !== String(currentUserId)) isRead = true;
        return { ...rest, isRead, readBy, reactions: this.groupReactions(reactions) };
    }

    private async assertMember(userId: number, conversationId: number) {
        const m = await this.prisma.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
        });
        if (!m) throw new ForbiddenException('Not a member');
        return m;
    }

    private async assertAdmin(userId: number, conversationId: number) {
        const m = await this.assertMember(userId, conversationId);
        if (m.role === 'MEMBER') throw new ForbiddenException('Admin required');
        return m;
    }

    private async getOtherMembersLastRead(conversationId: number, currentUserId: number) {
        const members = await this.prisma.conversationMember.findMany({
            where: { conversationId, userId: { not: currentUserId } },
            select: { userId: true, lastReadAt: true, user: { select: { nickname: true } } },
        });
        const map = new Map<number, { lastReadAt: Date; nickname: string }>();
        for (const m of members) map.set(m.userId, { lastReadAt: m.lastReadAt, nickname: m.user.nickname });
        return map;
    }

    private scheduledFilter(userId: number) {
        return {
            OR: [
                { scheduledAt: null },
                { scheduledAt: { lte: new Date() } },
                { senderId: userId },
            ],
        };
    }

    // My conversations (paginated, with pin/archive)

    async getMyConversations(userId: number, skip = 0, take = 20, showArchived = false) {
        const TAKE = Math.min(take, 50);

        const memberships = await this.prisma.conversationMember.findMany({
            where: {
                userId,
                isArchived: showArchived ? true : false,
            },
            include: {
                conversation: {
                    include: {
                        members:  { include: { user: { select: MEMBER_USER_SELECT } } },
                        messages: {
                            where:   { deletedAt: null, ...this.scheduledFilter(userId) },
                            orderBy: { id: 'desc' },
                            take:    1,
                            select:  { id: true, content: true, senderId: true, createdAt: true, fileType: true, fileUrl: true },
                        },
                    },
                },
            },
            // Pinned chats first, then by conversation updatedAt
            orderBy: [
                { isPinned:    'desc' },
                { conversation: { updatedAt: 'desc' } },
            ],
            skip,
            take: TAKE + 1,
        });

        const hasMore = memberships.length > TAKE;
        const page    = hasMore ? memberships.slice(0, TAKE) : memberships;

        const conversations = await Promise.all(page.map(async (m) => {
            const conv = m.conversation;

            // Fetch latest pinned message for the banner
            const latestPinned = await this.prisma.pinnedMessage.findFirst({
                where:   { conversationId: conv.id },
                orderBy: { pinnedAt: 'desc' },
                select:  {
                    messageId: true,
                    message: { select: { id: true, content: true, sender: { select: { id: true, nickname: true } } } },
                },
            });

            const pinnedCount = await this.prisma.pinnedMessage.count({
                where: { conversationId: conv.id },
            });

            const unreadCount = await this.prisma.message.count({
                where: {
                    conversationId: conv.id,
                    senderId:       { not: userId },
                    deletedAt:      null,
                    createdAt:      { gt: m.lastReadAt },
                    ...this.scheduledFilter(userId),
                },
            });

            let displayName   = conv.name;
            let displayAvatar = conv.avatarUrl;
            let isOnline      = false;

            if (conv.type === 'DIRECT') {
                const other = conv.members.find(mem => mem.userId !== userId);
                if (other) {
                    displayName   = other.user.nickname;
                    displayAvatar = other.user.avatarUrl;
                    isOnline      = other.user.isOnline;
                } else {
                    displayName = 'Збережені';
                }
            }

            return {
                id: conv.id, type: conv.type, name: displayName, avatarUrl: displayAvatar,
                description: conv.description, isOnline, myRole: m.role,
                lastMessage:  conv.messages[0] ?? null,
                unreadCount,
                members:      conv.members.map(mem => ({ userId: mem.userId, role: mem.role, joinedAt: mem.joinedAt, user: mem.user })),
                updatedAt:    conv.updatedAt,
                isPinned:     m.isPinned,
                isArchived:   m.isArchived,
                // Latest pinned message for the banner (null if nothing pinned)
                pinnedMessage: latestPinned?.message ?? null,
                pinnedCount,
            };
        }));

        return { conversations, hasMore };
    }

    // Pin / Archive chat (sidebar, per-user)

    async setChatPinned(userId: number, conversationId: number, isPinned: boolean) {
        await this.assertMember(userId, conversationId);
        await this.prisma.conversationMember.update({
            where: { conversationId_userId: { conversationId, userId } },
            data:  { isPinned },
        });
        return { isPinned };
    }

    async setChatArchived(userId: number, conversationId: number, isArchived: boolean) {
        await this.assertMember(userId, conversationId);
        await this.prisma.conversationMember.update({
            where: { conversationId_userId: { conversationId, userId } },
            data:  { isArchived, ...(isArchived ? { isPinned: false } : {}) },
        });
        return { isArchived };
    }

    // Multi-pin messages

    async addPinnedMessage(userId: number, conversationId: number, messageId: number) {
        await this.assertAdmin(userId, conversationId);

        const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
        if (!msg || msg.conversationId !== conversationId) throw new NotFoundException('Message not found');
        if (msg.deletedAt) throw new BadRequestException('Cannot pin a deleted message');

        const currentCount = await this.prisma.pinnedMessage.count({ where: { conversationId } });
        if (currentCount >= MAX_PINNED_MESSAGES) {
            throw new BadRequestException(`Cannot pin more than ${MAX_PINNED_MESSAGES} messages`);
        }

        const pinned = await this.prisma.pinnedMessage.upsert({
            where:  { conversationId_messageId: { conversationId, messageId } },
            create: { conversationId, messageId, pinnedById: userId },
            update: { pinnedAt: new Date(), pinnedById: userId },
            select: {
                messageId: true, pinnedAt: true,
                message: { select: { id: true, content: true, sender: { select: { id: true, nickname: true } } } },
            },
        });

        const pinnedCount = await this.prisma.pinnedMessage.count({ where: { conversationId } });
        return { pinned, pinnedCount };
    }

    async removePinnedMessage(userId: number, conversationId: number, messageId: number) {
        await this.assertAdmin(userId, conversationId);

        await this.prisma.pinnedMessage.deleteMany({ where: { conversationId, messageId } });

        const pinnedCount = await this.prisma.pinnedMessage.count({ where: { conversationId } });
        // Return the new "current" pinned message (latest remaining)
        const latest = await this.prisma.pinnedMessage.findFirst({
            where:   { conversationId },
            orderBy: { pinnedAt: 'desc' },
            select:  {
                messageId: true,
                message: { select: { id: true, content: true, sender: { select: { id: true, nickname: true } } } },
            },
        });

        return { unpinnedMessageId: messageId, pinnedCount, latestPinnedMessage: latest?.message ?? null };
    }

    async getPinnedMessages(userId: number, conversationId: number) {
        await this.assertMember(userId, conversationId);
        return this.prisma.pinnedMessage.findMany({
            where:   { conversationId },
            orderBy: { pinnedAt: 'desc' },
            select:  {
                id: true, messageId: true, pinnedAt: true,
                pinnedBy: { select: { id: true, nickname: true } },
                message:  { select: { id: true, content: true, fileType: true, fileUrl: true, sender: { select: { id: true, nickname: true } } } },
            },
        });
    }

    // Messages

    async getMessages(userId: number, conversationId: number, cursor?: number) {
        await this.assertMember(userId, conversationId);
        const member = !cursor
            ? await this.prisma.conversationMember.findUnique({
                where:  { conversationId_userId: { conversationId, userId } },
                select: { lastReadAt: true },
            })
            : null;

        const msgs = await this.prisma.message.findMany({
            where:   { conversationId, ...this.scheduledFilter(userId) },
            select:  MSG_SELECT,
            take:    30,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'desc' },
        });

        const otherMembersLastRead = await this.getOtherMembersLastRead(conversationId, userId);
        const ordered = msgs.reverse();

        const firstUnreadMsg = !cursor && member?.lastReadAt
            ? ordered.find(m =>
                String(m.senderId) !== String(userId) &&
                new Date(m.createdAt) > member!.lastReadAt,
            )
            : null;

        const messages = ordered.map(msg => this.mapMessageWithRead(msg, userId, otherMembersLastRead));
        if (cursor) return messages;
        return { messages, meta: { firstUnreadId: firstUnreadMsg?.id ?? null } };
    }

    async getMessagesAround(userId: number, conversationId: number, around: number) {
        await this.assertMember(userId, conversationId);
        const msgs = await this.prisma.message.findMany({
            where: { conversationId, id: { lte: around }, ...this.scheduledFilter(userId) },
            select: MSG_SELECT, take: 30, orderBy: { id: 'desc' },
        });
        const otherMembersLastRead = await this.getOtherMembersLastRead(conversationId, userId);
        return msgs.reverse().map(msg => this.mapMessageWithRead(msg, userId, otherMembersLastRead));
    }

    async getMessagesAfter(userId: number, conversationId: number, after: number) {
        await this.assertMember(userId, conversationId);
        const msgs = await this.prisma.message.findMany({
            where: { conversationId, id: { gt: after }, ...this.scheduledFilter(userId) },
            select: MSG_SELECT, take: 30, orderBy: { id: 'asc' },
        });
        const otherMembersLastRead = await this.getOtherMembersLastRead(conversationId, userId);
        return msgs.map(msg => this.mapMessageWithRead(msg, userId, otherMembersLastRead));
    }

    async searchMessages(userId: number, conversationId: number, query: string) {
        await this.assertMember(userId, conversationId);
        const q = query.trim();
        if (q.length < 2) return [];
        const msgs = await this.prisma.message.findMany({
            where: {
                conversationId, deletedAt: null,
                content: { contains: q, mode: 'insensitive' },
                ...this.scheduledFilter(userId),
            },
            select: MSG_SELECT, orderBy: { id: 'desc' }, take: 30,
        });
        const otherMembersLastRead = await this.getOtherMembersLastRead(conversationId, userId);
        return msgs.reverse().map(msg => this.mapMessageWithRead(msg, userId, otherMembersLastRead));
    }

    async getMediaFiles(userId: number, conversationId: number) {
        await this.assertMember(userId, conversationId);
        return this.prisma.message.findMany({
            where: { conversationId, deletedAt: null, fileUrl: { not: null }, ...this.scheduledFilter(userId) },
            select: {
                id: true, fileUrl: true, fileName: true, fileType: true,
                fileSize: true, metadata: true, createdAt: true, senderId: true,
                sender: { select: { id: true, nickname: true } },
            },
            orderBy: { id: 'desc' }, take: 200,
        });
    }

    async getMessageById(messageId: number) {
        const msg = await this.prisma.message.findUnique({ where: { id: messageId }, select: MSG_SELECT });
        if (!msg) return null;
        return { ...this.mapMessage(msg), isRead: false };
    }

    // Save message

    async saveMessage(userId: number, conversationId: number, dto: {
        content?: string; fileUrl?: string; fileName?: string;
        fileType?: string; fileSize?: number; replyToId?: number;
        metadata?: string; scheduledAt?: Date | null;
    }) {
        const member = await this.assertMember(userId, conversationId);
        const conv   = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv) throw new NotFoundException('Conversation not found');
        if (conv.type === 'CHANNEL' && member.role === 'MEMBER')
            throw new ForbiddenException('Only admins can post in channels');

        const msg = await this.prisma.message.create({
            data: {
                content:       dto.content?.trim() ?? '',
                senderId:      userId,
                conversationId,
                fileUrl:       dto.fileUrl,
                fileName:      dto.fileName,
                fileType:      dto.fileType,
                fileSize:      dto.fileSize,
                replyToId:     dto.replyToId,
                metadata:      validateAndNormalizeMetadata(dto.metadata),
                scheduledAt:   dto.scheduledAt ?? null,
            },
            select: MSG_SELECT,
        });

        await this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        return { ...this.mapMessage(msg), isRead: false };
    }

    async markAsRead(userId: number, conversationId: number) {
        await this.prisma.conversationMember.updateMany({
            where: { conversationId, userId },
            data:  { lastReadAt: new Date() },
        });
    }

    // Delete / Edit / React

    async deleteMessage(messageId: number, userId: number) {
        const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
        if (!msg) throw new NotFoundException('Message not found');
        if (msg.senderId !== userId) {
            const m = await this.prisma.conversationMember.findUnique({
                where: { conversationId_userId: { conversationId: msg.conversationId, userId } },
            });
            if (!m || m.role === 'MEMBER') throw new ForbiddenException('Cannot delete this message');
        }
        if (msg.deletedAt) return msg;
        const deleted = await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
        if (msg.fileUrl) {
            const otherRefs = await this.prisma.message.count({
                where: { fileUrl: msg.fileUrl, deletedAt: null, id: { not: messageId } },
            });
            if (otherRefs === 0) this.upload.deleteFile(msg.fileUrl).catch(() => {});
        }
        return deleted;
    }

    async editMessage(messageId: number, userId: number, content: string) {
        const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
        if (!msg) throw new NotFoundException('Not found');
        if (msg.senderId !== userId) throw new ForbiddenException('Cannot edit others\' messages');
        if (msg.deletedAt) throw new BadRequestException('Cannot edit deleted message');
        if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) throw new BadRequestException('Edit window expired');
        const trimmed = content.trim();
        if (!trimmed) throw new BadRequestException('Content empty');
        if (trimmed === msg.content) return msg;
        return this.prisma.message.update({ where: { id: messageId }, data: { content: trimmed, editedAt: new Date() } });
    }

    async toggleReaction(messageId: number, userId: number, emoji: string) {
        if (!ALLOWED_EMOJIS.includes(emoji)) throw new BadRequestException('Invalid emoji');
        const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
        if (!msg) throw new NotFoundException('Not found');
        if (msg.deletedAt) throw new BadRequestException('Cannot react to deleted message');
        await this.assertMember(userId, msg.conversationId);
        const existing = await this.prisma.reaction.findUnique({
            where: { userId_messageId_emoji: { userId, messageId, emoji } },
        });
        if (existing) await this.prisma.reaction.delete({ where: { id: existing.id } });
        else          await this.prisma.reaction.create({ data: { emoji, userId, messageId } });
        const reactions = await this.prisma.reaction.findMany({
            where: { messageId },
            select: { emoji: true, userId: true, user: { select: { id: true, nickname: true, avatarUrl: true } } },
            orderBy: { createdAt: 'asc' },
        });
        return { grouped: this.groupReactions(reactions), conversationId: msg.conversationId };
    }

    // Forward

    async forwardMessage(userId: number, messageId: number, targetConversationId: number, reEncryptedContent?: string) {
        await this.assertMember(userId, targetConversationId);
        const original = await this.prisma.message.findUnique({ where: { id: messageId } });
        if (!original) throw new NotFoundException('Message not found');

        const contentToStore = reEncryptedContent ?? original.content;
        const msg = await this.prisma.message.create({
            data: {
                content: contentToStore, senderId: userId, conversationId: targetConversationId,
                fileUrl: original.fileUrl, fileName: original.fileName,
                fileType: original.fileType, fileSize: original.fileSize,
                forwardedFromId: original.id, forwardedFromUserId: original.senderId,
            },
            select: MSG_SELECT,
        });
        await this.prisma.conversation.update({ where: { id: targetConversationId }, data: { updatedAt: new Date() } });
        return { ...this.mapMessage(msg), isRead: false };
    }

    // Direct / Group / Channel

    async getOrCreateDirect(userId: number, targetId: number) {
        const isSelf = userId === targetId;
        if (!isSelf) {
            const target = await this.prisma.user.findUnique({ where: { id: targetId } });
            if (!target) throw new NotFoundException('User not found');
        }
        const existing = isSelf
            ? await this.prisma.conversation.findFirst({
                where: { type: 'DIRECT', members: { some: { userId }, every: { userId } } },
                include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
            })
            : await this.prisma.conversation.findFirst({
                where: { type: 'DIRECT', AND: [{ members: { some: { userId } } }, { members: { some: { userId: targetId } } }] },
                include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
            });
        if (existing) return existing;
        return this.prisma.conversation.create({
            data: {
                type: 'DIRECT', createdById: userId,
                members: { create: isSelf
                        ? [{ userId, role: 'MEMBER' }]
                        : [{ userId, role: 'MEMBER' }, { userId: targetId, role: 'MEMBER' }]
                },
            },
            include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
        });
    }

    async createGroup(userId: number, dto: { name: string; description?: string; memberIds: number[] }) {
        const uniqueIds = [...new Set(dto.memberIds.filter(id => id !== userId))];
        return this.prisma.conversation.create({
            data: {
                type: 'GROUP', name: dto.name, description: dto.description, createdById: userId,
                members: { create: [{ userId, role: 'OWNER' }, ...uniqueIds.map(id => ({ userId: id, role: 'MEMBER' as const }))] },
            },
            include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
        });
    }

    async createChannel(userId: number, dto: { name: string; description?: string }) {
        return this.prisma.conversation.create({
            data: {
                type: 'CHANNEL', name: dto.name, description: dto.description, createdById: userId,
                members: { create: [{ userId, role: 'OWNER' }] },
            },
            include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
        });
    }

    async getConversation(userId: number, conversationId: number) {
        await this.assertMember(userId, conversationId);
        return this.prisma.conversation.findUnique({
            where:   { id: conversationId },
            include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
        });
    }

    async addMember(adminId: number, conversationId: number, targetUserId: number) {
        const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
        if (conv?.type === 'DIRECT') throw new BadRequestException('Cannot add to direct chats');
        await this.assertAdmin(adminId, conversationId);
        const exists = await this.prisma.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId: targetUserId } },
        });
        if (exists) throw new ConflictException('Already a member');
        return this.prisma.conversationMember.create({
            data: { conversationId, userId: targetUserId, role: 'MEMBER' },
            include: { user: { select: MEMBER_USER_SELECT } },
        });
    }

    async removeMember(adminId: number, conversationId: number, targetUserId: number) {
        const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
        if (conv?.type === 'DIRECT') throw new BadRequestException('Cannot remove from direct chats');
        if (adminId !== targetUserId) {
            await this.assertAdmin(adminId, conversationId);
            const target = await this.prisma.conversationMember.findUnique({
                where: { conversationId_userId: { conversationId, userId: targetUserId } },
            });
            if (target?.role === 'OWNER') throw new ForbiddenException('Cannot remove owner');
        }
        await this.prisma.groupSenderKey.deleteMany({ where: { conversationId, senderId: targetUserId } });
        await this.prisma.conversationMember.delete({
            where: { conversationId_userId: { conversationId, userId: targetUserId } },
        });
        return { removed: targetUserId };
    }

    async setMemberRole(ownerId: number, conversationId: number, targetUserId: number, role: 'ADMIN' | 'MEMBER') {
        const owner = await this.prisma.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId: ownerId } },
        });
        if (owner?.role !== 'OWNER') throw new ForbiddenException('Owner only');
        return this.prisma.conversationMember.update({
            where: { conversationId_userId: { conversationId, userId: targetUserId } },
            data:  { role },
        });
    }

    async updateConversation(userId: number, conversationId: number, dto: { name?: string; description?: string; avatarUrl?: string }) {
        await this.assertAdmin(userId, conversationId);
        return this.prisma.conversation.update({ where: { id: conversationId }, data: dto });
    }

    // Sender keys

    async setSenderKey(requesterId: number, conversationId: number, keys: Array<{ recipientId: number; encryptedKey: string }>) {
        await this.assertMember(requesterId, conversationId);
        const existingKeys = await this.prisma.groupSenderKey.findMany({
            where: { conversationId, senderId: requesterId },
            select: { recipientId: true },
        });
        const existingRecipients = new Set(existingKeys.map(k => k.recipientId));
        await Promise.all(
            keys.map(({ recipientId, encryptedKey }) => {
                if (existingRecipients.has(recipientId)) return Promise.resolve();
                return this.prisma.groupSenderKey.create({
                    data: { conversationId, senderId: requesterId, recipientId, encryptedKey },
                });
            }),
        );
        return { ok: true };
    }

    async getSenderKeysForMe(userId: number, conversationId: number) {
        await this.assertMember(userId, conversationId);
        return this.prisma.groupSenderKey.findMany({
            where:  { conversationId, recipientId: userId },
            select: { senderId: true, encryptedKey: true },
        });
    }

    async getPendingScheduledMessages() {
        return this.prisma.message.findMany({
            where:  { scheduledAt: { gt: new Date() }, deletedAt: null },
            select: { id: true, conversationId: true, scheduledAt: true, senderId: true },
        });
    }
}