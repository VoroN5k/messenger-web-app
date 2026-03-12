import {ForbiddenException, Injectable, NotFoundException} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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

        if (!message) {
            throw new NotFoundException('Message not found');
        }

        if (message.senderId !== userId) {
            throw new ForbiddenException('You can only delete your own messages');
        }

        if (message.deletedAt){
            return message;
        }

        return this.prisma.message.update({
            where: { id: messageId },
            data: { deletedAt: new Date() },
        });
    }


}