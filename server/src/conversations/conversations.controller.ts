import {
    Body, Controller, Delete, Get, Param,
    ParseIntPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service.js';
import { JwtAuthGuard }         from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser }          from '../auth/decorators/current-user.decorator.js';
import {
    CreateDirectDto, CreateGroupDto, CreateChannelDto,
    UpdateConversationDto, AddMemberDto,
} from './dto/conversation.dto.js';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
    constructor(private readonly conversationsService: ConversationsService) {}

    @Get()
    getAll(@CurrentUser('sub') userId: number) {
        return this.conversationsService.getMyConversations(userId);
    }

    @Post('direct')
    createDirect(@CurrentUser('sub') userId: number, @Body() dto: CreateDirectDto) {
        return this.conversationsService.getOrCreateDirect(userId, dto.targetUserId);
    }

    @Post('group')
    createGroup(@CurrentUser('sub') userId: number, @Body() dto: CreateGroupDto) {
        return this.conversationsService.createGroup(userId, dto);
    }

    @Post('channel')
    createChannel(@CurrentUser('sub') userId: number, @Body() dto: CreateChannelDto) {
        return this.conversationsService.createChannel(userId, dto);
    }

    @Get(':id')
    getOne(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
        return this.conversationsService.getConversation(userId, id);
    }

    @Put(':id')
    update(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateConversationDto,
    ) {
        return this.conversationsService.updateConversation(userId, id, dto);
    }

    @Get(':id/messages')
    getMessages(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query('cursor') cursor?: string,
        @Query('around') around?: string,
    ) {
        if (around) return this.conversationsService.getMessagesAround(userId, id, parseInt(around, 10));
        return this.conversationsService.getMessages(userId, id, cursor ? parseInt(cursor, 10) : undefined);
    }

    @Get(':id/messages/search')
    searchMessages(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query('q') q: string,
    ) {
        return this.conversationsService.searchMessages(userId, id, q ?? '');
    }

    @Post(':id/members')
    addMember(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AddMemberDto,
    ) {
        return this.conversationsService.addMember(userId, id, dto.userId);
    }

    @Delete(':id/members/:memberId')
    removeMember(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('memberId', ParseIntPipe) memberId: number,
    ) {
        return this.conversationsService.removeMember(userId, id, memberId);
    }

    @Post(':id/members/:memberId/role')
    setRole(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('memberId', ParseIntPipe) memberId: number,
        @Body('role') role: 'ADMIN' | 'MEMBER',
    ) {
        return this.conversationsService.setMemberRole(userId, id, memberId, role);
    }
}