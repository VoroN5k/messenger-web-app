import {BadRequestException, ForbiddenException, Injectable, NotFoundException} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 хвилин

const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏', '🎉', '💯']

@Injectable()
export class ChatService {
    constructor(private readonly prisma: PrismaService) {}

    // ─── Helpers ───────────────────────────────────────────────────────────────────────────────
    private groupReactions(reactions: { emoji: string; userId: number } []) {
        const map = new Map<string, number[]>();
        for (const r of reactions) {
            let userIds = map.get(r.emoji);
            if (!userIds) {
                userIds = [];
                map.set(r.emoji, userIds);
            }
            userIds.push(r.userId);
        }
        return Array.from(map.entries()).map(([emoji, userIds]) => ({
            emoji,
            count: userIds.length,
            userIds,
        }));
    }

    // ─── History ────────────────────────────────────────────────────────────────────────────────────────

    async getChatHistory(currentUserId: number, partnerId: number, cursor?: number) {
        const messages = await this.prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: partnerId },
                    { senderId: partnerId,     receiverId: currentUserId },
                ],
            },
            include: {
                sender:    { select: { nickname: true, id: true } },
                reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } },
            },
            take: 20,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'desc' },
        });


        return messages.reverse().map((msg) => {
            const { reactions, ...rest } = msg;
            return { ...rest, reactions: this.groupReactions(reactions) };
        });
    }

    // ─── Delete ─────────────────────────────────────────────────────────────────────────────────────────────────
    async softDeleteMessage(messageId: number, userId: number){
        const message = await this.prisma.message.findUnique({
            where: { id: messageId },
        });

        if (!message) throw new NotFoundException('Message not found');

        if (message.senderId !== userId) throw new ForbiddenException('You can only delete your own messages');

        if (message.deletedAt) return message;

        return this.prisma.message.update({
            where: { id: messageId },
            data: { deletedAt: new Date() },
        });
    }

    // ─── Edit ──────────────────────────────────────────────────────────────────────────────────────────────────
    async editMessage(messageId: number, userId: number, newContent: string) {
        const message = await this.prisma.message.findUnique({
            where: {id: messageId},
        });

        if (!message) throw new NotFoundException('Message not found')
        if (message.senderId !== userId) throw new ForbiddenException('You can only edit your own messages');
        if (message.deletedAt) throw new BadRequestException('Cannot edit a deleted message');

        const ageMs = Date.now() - new Date(message.createdAt).getTime();
        if (ageMs > EDIT_WINDOW_MS) throw new BadRequestException('Edit window of 15 minutes has expired')

        const trimmed = newContent.trim();
        if (!trimmed) throw new BadRequestException('Message content cannot be empty');
        if (trimmed.length > 4000) throw new BadRequestException('Message is too long');

        // if content is the same after trimming, do not update
        if (trimmed === message.content) return message;

        return this.prisma.message.update({
            where: { id: messageId },
            data: {
                content: trimmed,
                editedAt: new Date(),
            },
        });
    }

    async toggleReactions(messageId: number, userId: number, emoji: string) {
        if (!ALLOWED_EMOJIS.includes(emoji)) throw new BadRequestException('Invalid emoji');

        const message = await this.prisma.message.findUnique({
            where: { id: messageId },
        })

        if (!message) throw new NotFoundException('Message not found')
        if (message.deletedAt) throw new BadRequestException('Cannot react to a deleted message');

        // Only sender and receiver can react
        if (message.senderId !== userId && message.receiverId !== userId)
            throw new ForbiddenException('Cannot react to this message');

        const existing = await this.prisma.reaction.findUnique({
            where: { userId_messageId_emoji: { userId, messageId, emoji } },
        });

        if (existing) {
            await this.prisma.reaction.delete({ where: { id: existing.id } });
        } else {
            await this.prisma.reaction.create({ data: { emoji, userId, messageId } });
        }

        const reactions = await this.prisma.reaction.findMany({
            where: { messageId },
            select: { emoji: true, userId: true },
            orderBy: { createdAt: 'asc' },
        });

        return {
            grouped: this.groupReactions(reactions),
            senderId: message.senderId,
            receiverId: message.receiverId,
        }
    }

    async searchMessages(currentUserId: number, partnerId: number, query: string, limit = 30) {
        const q = query.trim();
        if (!q || q.length < 2) return [];

        const messages = await this.prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: partnerId },
                    { senderId: partnerId,     receiverId: currentUserId },
                ],
                deletedAt: null,
                content: { contains: q, mode: 'insensitive' },
            },
            include: {
                reactions: {select: {emoji: true, userId: true}, orderBy: {createdAt: 'asc'}},
            },
            orderBy: { id: 'desc' },
            take: limit,
        });

        return messages.reverse().map((msg) => {
            const { reactions, ...rest } = msg;
            return { ...rest, reactions: this.groupReactions(reactions) };
        });
    }

    async getMessagesAround(currentUserId: number, partnerId: number, around: number) {
        const messages = await this.prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: partnerId },
                    { senderId: partnerId,     receiverId: currentUserId },
                ],
                id: { lte: around },
            },
            include: {
                reactions: {select: {emoji: true, userId: true}, orderBy: {createdAt: 'asc'}},
            },
            take: 20,
            orderBy: { id: 'desc' },
        });

        return messages.reverse().map((msg) => {
            const { reactions, ...rest } = msg;
            return { ...rest, reactions: this.groupReactions(reactions) };
        });
    }
}