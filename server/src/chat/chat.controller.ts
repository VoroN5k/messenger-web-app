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
    ) {

        const currentUserId = userId;

        const parsedCursor = cursor ? parseInt(cursor, 10) : undefined;

        return this.chatService.getChatHistory(currentUserId, withUserId, parsedCursor);

    }
}