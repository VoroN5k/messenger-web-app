import {
    BadRequestException, ConflictException, ForbiddenException,
    Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const ALLOWED_EMOJIS = ['👍','❤️','😂','😮','😢','😡','🔥','👏','🎉','💯'];

const MSG_SELECT = {
    id: true, content: true, createdAt: true, editedAt: true, deletedAt: true,
    fileUrl: true, fileName: true, fileType: true, fileSize: true,
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
      }
    },
    reactions: {
        select:  { emoji: true, userId: true },
        orderBy: { createdAt: 'asc' as const },
    },
};

const MEMBER_USER_SELECT = {
    id: true, nickname: true, avatarUrl: true, isOnline: true, lastSeen: true,
};

@Injectable()
export class ConversationsService {
    constructor(private readonly prisma: PrismaService) {}

    // ── Helpers ───────────────────────────────────────────────────────────────
    private groupReactions(reactions: { emoji: string; userId: number }[]) {
        const map = new Map<string, number[]>();
        for (const r of reactions) {
            const ids = map.get(r.emoji) ?? [];
            ids.push(r.userId);
            map.set(r.emoji, ids);
        }
        return Array.from(map.entries()).map(([emoji, userIds]) => ({
            emoji, count: userIds.length, userIds,
        }));
    }

    private mapMessage(msg: any) {
        const { reactions, ...rest } = msg;
        return { ...rest, reactions: this.groupReactions(reactions) };
    }

    // FIX: mapMessage з isRead — перевіряємо чи хтось інший прочитав після createdAt
    private mapMessageWithRead(
        msg: any,
        currentUserId: number,
        otherMembersLastRead: Map<number, { lastReadAt: Date; nickname: string }>,
    ) {
        const { reactions, ...rest } = msg;
        const msgTime = new Date(rest.createdAt).getTime();

        let isRead = false;
        const readBy: { userId: number; nickname: string }[] = [];

        for (const [userId, { lastReadAt, nickname }] of otherMembersLastRead.entries()) {
            if (lastReadAt.getTime() >= msgTime) {
                readBy.push({ userId, nickname });
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

    // ── Отримуємо lastReadAt інших учасників для визначення isRead ────────────
    private async getOtherMembersLastRead(
        conversationId: number,
        currentUserId: number,
    ): Promise<Map<number, { lastReadAt: Date, nickname: string }>> {
        const members = await this.prisma.conversationMember.findMany({
            where: { conversationId, userId: { not: currentUserId } },
            select: { userId: true, lastReadAt: true, user: { select: { nickname: true } } },
        });
        const map = new Map<number, { lastReadAt: Date; nickname: string }>();
        for (const m of members) {
            map.set(m.userId, { lastReadAt: m.lastReadAt, nickname: m.user.nickname });
        }
        return map;
    }

    // ── My conversations ──────────────────────────────────────────────────────
    async getMyConversations(userId: number) {
        const memberships = await this.prisma.conversationMember.findMany({
            where: { userId },
            include: {
                conversation: {
                    include: {
                        members: {
                            include: { user: { select: MEMBER_USER_SELECT } },
                        },
                        messages: {
                            where:   { deletedAt: null },
                            orderBy: { id: 'desc' },
                            take:    1,
                            select: {
                                id: true, content: true, senderId: true,
                                createdAt: true, fileType: true, fileUrl: true,
                            },
                        },
                    },
                },
            },
            orderBy: { conversation: { updatedAt: 'desc' } },
        });

        return Promise.all(
            memberships.map(async (m) => {
                const conv = m.conversation;

                // ← явно дістаємо pinnedMessageId окремим запитом
                const convFull = await this.prisma.conversation.findUnique({
                    where:  { id: conv.id },
                    select: { pinnedMessageId: true },
                });

                const unreadCount = await this.prisma.message.count({
                    where: {
                        conversationId: conv.id,
                        senderId:       { not: userId },
                        deletedAt:      null,
                        createdAt:      { gt: m.lastReadAt },
                    },
                });

                let displayName   = conv.name;
                let displayAvatar = conv.avatarUrl;
                let isOnline      = false;

                if (conv.type === 'DIRECT') {
                    const other = conv.members.find((mem) => mem.userId !== userId);
                    if (other) {
                        displayName   = other.user.nickname;
                        displayAvatar = other.user.avatarUrl;
                        isOnline      = other.user.isOnline;
                    }
                }

                const pinnedMessageId = convFull?.pinnedMessageId ?? null;

                // Завантажуємо pinnedMessage якщо є
                const pinnedMessage = pinnedMessageId
                    ? await this.prisma.message.findUnique({
                        where:  { id: pinnedMessageId },
                        select: {
                            id:      true,
                            content: true,
                            sender:  { select: { id: true, nickname: true } },
                        },
                    })
                    : null;

                return {
                    id:              conv.id,
                    type:            conv.type,
                    name:            displayName,
                    avatarUrl:       displayAvatar,
                    description:     conv.description,
                    isOnline,
                    myRole:          m.role,
                    lastMessage:     conv.messages[0] ?? null,
                    unreadCount,
                    members:         conv.members.map((mem) => ({
                        userId:   mem.userId,
                        role:     mem.role,
                        joinedAt: mem.joinedAt,
                        user:     mem.user,
                    })),
                    updatedAt:        conv.updatedAt,
                    pinnedMessageId,           // ← NEW
                    pinnedMessage,             // ← NEW
                };
            }),
        );
    }

    async pinMessage(userId: number, conversationId: number, messageId: number) {
        await this.assertAdmin(userId, conversationId);
        const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
        if (!msg || msg.conversationId !== conversationId) throw new NotFoundException('Message not found');

        await this.prisma.conversation.update({
            where: { id: conversationId },
            data:  { pinnedMessageId: messageId },
        });
        return { pinnedMessageId: messageId, message: this.mapMessage(msg) };
    }

    async unpinMessage(userId: number, conversationId: number) {
        await this.assertAdmin(userId, conversationId);
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data:  { pinnedMessageId: null },
        });
        return { pinnedMessageId: null };
    }

    async forwardMessage(userId: number, messageId: number, targetConversationId: number) {
        await this.assertMember(userId, targetConversationId);
        const original = await this.prisma.message.findUnique({ where: { id: messageId } });
        if (!original) throw new NotFoundException('Message not found');

        const msg = await this.prisma.message.create({
            data: {
                content:            original.content,
                senderId:           userId,
                conversationId:     targetConversationId,
                fileUrl:            original.fileUrl,
                fileName:           original.fileName,
                fileType:           original.fileType,
                fileSize:           original.fileSize,
                forwardedFromId:    original.id,
                forwardedFromUserId: original.senderId,
            },
            select: MSG_SELECT,
        });

        await this.prisma.conversation.update({
            where: { id: targetConversationId },
            data:  { updatedAt: new Date() },
        });

        return { ...this.mapMessage(msg), isRead: false };
    }

    // ── Get or create DIRECT ──────────────────────────────────────────────────
    async getOrCreateDirect(userId: number, targetId: number) {
        if (userId === targetId) throw new BadRequestException('Cannot DM yourself');

        const target = await this.prisma.user.findUnique({ where: { id: targetId } });
        if (!target) throw new NotFoundException('User not found');

        const existing = await this.prisma.conversation.findFirst({
            where: {
                type: 'DIRECT',
                AND: [
                    { members: { some: { userId } } },
                    { members: { some: { userId: targetId } } },
                ],
            },
            include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
        });

        if (existing) return existing;

        return this.prisma.conversation.create({
            data: {
                type:        'DIRECT',
                createdById: userId,
                members: {
                    create: [
                        { userId,    role: 'MEMBER' },
                        { userId: targetId, role: 'MEMBER' },
                    ],
                },
            },
            include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
        });
    }

    // ── Create GROUP ──────────────────────────────────────────────────────────
    async createGroup(userId: number, dto: { name: string; description?: string; memberIds: number[] }) {
        const uniqueIds = [...new Set(dto.memberIds.filter((id) => id !== userId))];
        return this.prisma.conversation.create({
            data: {
                type:        'GROUP',
                name:        dto.name,
                description: dto.description,
                createdById: userId,
                members: {
                    create: [
                        { userId, role: 'OWNER' },
                        ...uniqueIds.map((id) => ({ userId: id, role: 'MEMBER' as const })),
                    ],
                },
            },
            include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
        });
    }

    // ── Create CHANNEL ────────────────────────────────────────────────────────
    async createChannel(userId: number, dto: { name: string; description?: string }) {
        return this.prisma.conversation.create({
            data: {
                type:        'CHANNEL',
                name:        dto.name,
                description: dto.description,
                createdById: userId,
                members: { create: [{ userId, role: 'OWNER' }] },
            },
            include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
        });
    }

    // ── Single conversation ───────────────────────────────────────────────────
    async getConversation(userId: number, conversationId: number) {
        await this.assertMember(userId, conversationId);
        return this.prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { members: { include: { user: { select: MEMBER_USER_SELECT } } } },
        });
    }

    // ── Messages ──────────────────────────────────────────────────────────────
    async getMessages(userId: number, conversationId: number, cursor?: number) {
        await this.assertMember(userId, conversationId);

        const msgs = await this.prisma.message.findMany({
            where:   { conversationId },
            select:  MSG_SELECT,
            take:    30,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'desc' },
        });

        // FIX: отримуємо lastReadAt інших учасників для розрахунку isRead
        const otherMembersLastRead = await this.getOtherMembersLastRead(conversationId, userId);

        return msgs.reverse().map((msg) =>
            this.mapMessageWithRead(msg, userId, otherMembersLastRead),
        );
    }

    async getMessagesAround(userId: number, conversationId: number, around: number) {
        await this.assertMember(userId, conversationId);

        const msgs = await this.prisma.message.findMany({
            where:   { conversationId, id: { lte: around } },
            select:  MSG_SELECT,
            take:    30,
            orderBy: { id: 'desc' },
        });

        const otherMembersLastRead = await this.getOtherMembersLastRead(conversationId, userId);

        return msgs.reverse().map((msg) =>
            this.mapMessageWithRead(msg, userId, otherMembersLastRead),
        );
    }

    async searchMessages(userId: number, conversationId: number, query: string) {
        await this.assertMember(userId, conversationId);
        const q = query.trim();
        if (q.length < 2) return [];
        const msgs = await this.prisma.message.findMany({
            where:   { conversationId, deletedAt: null, content: { contains: q, mode: 'insensitive' } },
            select:  MSG_SELECT,
            orderBy: { id: 'desc' },
            take:    30,
        });

        const otherMembersLastRead = await this.getOtherMembersLastRead(conversationId, userId);

        return msgs.reverse().map((msg) =>
            this.mapMessageWithRead(msg, userId, otherMembersLastRead),
        );
    }

    // ── Save message (from gateway) ───────────────────────────────────────────
    async saveMessage(userId: number, conversationId: number, dto: {
        content?: string; fileUrl?: string; fileName?: string;
        fileType?: string; fileSize?: number; replyToId?: number;
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
            },
            select: MSG_SELECT,
        });

        await this.prisma.conversation.update({
            where: { id: conversationId },
            data:  { updatedAt: new Date() },
        });

        // Новe повідомлення завжди isRead: false (ніхто ще не прочитав)
        return { ...this.mapMessage(msg), isRead: false };
    }

    // ── Mark as read ──────────────────────────────────────────────────────────
    async markAsRead(userId: number, conversationId: number) {
        await this.prisma.conversationMember.updateMany({
            where: { conversationId, userId },
            data:  { lastReadAt: new Date() },
        });
    }

    // ── Delete / Edit / React ─────────────────────────────────────────────────
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

        return this.prisma.message.update({
            where: { id: messageId },
            data:  { deletedAt: new Date() },
        });
    }

    async editMessage(messageId: number, userId: number, content: string) {
        const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
        if (!msg)                  throw new NotFoundException('Not found');
        if (msg.senderId !== userId) throw new ForbiddenException('Cannot edit others\' messages');
        if (msg.deletedAt)           throw new BadRequestException('Cannot edit deleted message');
        if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS)
            throw new BadRequestException('Edit window expired');

        const trimmed = content.trim();
        if (!trimmed)           throw new BadRequestException('Content empty');
        if (trimmed === msg.content) return msg;

        return this.prisma.message.update({
            where: { id: messageId },
            data:  { content: trimmed, editedAt: new Date() },
        });
    }

    async toggleReaction(messageId: number, userId: number, emoji: string) {
        if (!ALLOWED_EMOJIS.includes(emoji)) throw new BadRequestException('Invalid emoji');

        const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
        if (!msg)           throw new NotFoundException('Not found');
        if (msg.deletedAt)  throw new BadRequestException('Cannot react to deleted message');
        await this.assertMember(userId, msg.conversationId);

        const existing = await this.prisma.reaction.findUnique({
            where: { userId_messageId_emoji: { userId, messageId, emoji } },
        });

        if (existing) await this.prisma.reaction.delete({ where: { id: existing.id } });
        else          await this.prisma.reaction.create({ data: { emoji, userId, messageId } });

        const reactions = await this.prisma.reaction.findMany({
            where:   { messageId },
            select:  { emoji: true, userId: true },
            orderBy: { createdAt: 'asc' },
        });

        return { grouped: this.groupReactions(reactions), conversationId: msg.conversationId };
    }

    // ── Members ───────────────────────────────────────────────────────────────
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

    async updateConversation(userId: number, conversationId: number, dto: {
        name?: string; description?: string; avatarUrl?: string;
    }) {
        await this.assertAdmin(userId, conversationId);
        return this.prisma.conversation.update({ where: { id: conversationId }, data: dto });
    }
}