import {Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {ChatService} from "./chat.service.js";
import {CurrentUser} from "../auth/decorators/current-user.decorator.js";

@Controller('chat')
export class ChatController {

    constructor(private readonly chatService: ChatService) {}

    @Get('history/:withUserId')
    @UseGuards(JwtAuthGuard)
    async getChatHistory(
        @CurrentUser('sub') userId: number,
        @Param('withUserId', ParseIntPipe) withUserId: number,
        @Query('cursor') cursor?: string,
        @Query('around') around?: string,
    ) {

        if (around) {
            const aroundId = parseInt(around, 10);
            return this.chatService.getMessagesAround(userId, withUserId, aroundId);
        }

        const parsedCursor = cursor ? parseInt(cursor, 10) : undefined;
        return this.chatService.getChatHistory(userId, withUserId, parsedCursor);
    }

    @Get('search')
    @UseGuards(JwtAuthGuard)
    async searchMessages(
        @CurrentUser('sub') userId: number,
        @Query('q')             q:      string,
        @Query('withUserId') withUserIdStr: string,
    ) {
        const withUserId = parseInt(withUserIdStr, 10);
        return this.chatService.searchMessages(userId, withUserId, q ?? '');
    }
}