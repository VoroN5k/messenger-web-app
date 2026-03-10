import { Injectable } from '@nestjs/common';
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


}