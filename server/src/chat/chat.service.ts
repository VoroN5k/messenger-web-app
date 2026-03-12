import {BadRequestException, ForbiddenException, Injectable, NotFoundException} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 хвилин

@Injectable()
export class ChatService {
    constructor(private readonly prisma: PrismaService) {}

    async getChatHistory(currentUserId: number, partnerId: number, cursor?: number) {
        const limit = 20;

        const messages = await this.prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: partnerId },
                    { senderId: partnerId, receiverId: currentUserId },
                ],
            },
            include: {
                sender: { select: { nickname: true, id: true } }
            },
            take: limit,
            ...(cursor ? {
                skip: 1,
                cursor: { id: cursor },
            } : {}),
            // ВАЖЛИВО: DESC,

            orderBy: { id: 'desc' },
        });


        return messages.reverse();
    }

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
            data: { content: trimmed },
        });
    }


}