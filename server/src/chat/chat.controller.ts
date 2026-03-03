import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller('chat') // Додаємо префікс шляху /chat
export class ChatController {

    constructor(private readonly prisma: PrismaService) {}

    @Get('history/:withUserId')
    @UseGuards(JwtAuthGuard)
    async getChatHistory(
        @Req() req,
        @Param('withUserId', ParseIntPipe) withUserId: number,
    ) {

        const currentUserId = req.user.id || req.user.sub;

        return this.prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: withUserId },
                    { senderId: withUserId, receiverId: currentUserId },
                ],
            },
            include: {
                sender: {
                    select: { nickname: true, id: true }
                }
            },
            orderBy: { createdAt: 'asc' },
            take: 50,
        });
    }
}