import {
    Body, Controller, Delete, Get, Param,
    ParseIntPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ConversationsService } from './conversations.service.js';
import { JwtAuthGuard }         from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser }          from '../auth/decorators/current-user.decorator.js';
import {
    CreateDirectDto, CreateGroupDto, CreateChannelDto,
    UpdateConversationDto, AddMemberDto, PinMessageDto,
    ForwardMessageDto, SetSenderKeysDto,
} from './dto/conversation.dto.js';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
    constructor(private readonly conversationsService: ConversationsService) {}

    // Read-heavy — generous limit
    @SkipThrottle()
    @Get()
    getAll(@CurrentUser('sub') userId: number) {
        return this.conversationsService.getMyConversations(userId);
    }

    // Creating conversations — moderate limit
    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Post('direct')
    createDirect(@CurrentUser('sub') userId: number, @Body() dto: CreateDirectDto) {
        return this.conversationsService.getOrCreateDirect(userId, dto.targetUserId);
    }

    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Post('group')
    createGroup(@CurrentUser('sub') userId: number, @Body() dto: CreateGroupDto) {
        return this.conversationsService.createGroup(userId, dto);
    }

    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Post('channel')
    createChannel(@CurrentUser('sub') userId: number, @Body() dto: CreateChannelDto) {
        return this.conversationsService.createChannel(userId, dto);
    }

    @SkipThrottle()
    @Get(':id')
    getOne(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
        return this.conversationsService.getConversation(userId, id);
    }

    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Put(':id')
    update(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateConversationDto,
    ) {
        return this.conversationsService.updateConversation(userId, id, dto);
    }

    // Pagination — 120 req/min (user scrolls fast)
    @Throttle({ default: { ttl: 60_000, limit: 120 } })
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

    // Media gallery — 30 req/min
    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @Get(':id/media')
    getMedia(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.conversationsService.getMediaFiles(userId, id);
    }

    // Search — 30 req/min (debounced on client anyway)
    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @Get(':id/messages/search')
    searchMessages(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query('q') q: string,
    ) {
        return this.conversationsService.searchMessages(userId, id, q ?? '');
    }

    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Post(':id/members')
    addMember(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AddMemberDto,
    ) {
        return this.conversationsService.addMember(userId, id, dto.userId);
    }

    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Delete(':id/members/:memberId')
    removeMember(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('memberId', ParseIntPipe) memberId: number,
    ) {
        return this.conversationsService.removeMember(userId, id, memberId);
    }

    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Post(':id/members/:memberId/role')
    setRole(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('memberId', ParseIntPipe) memberId: number,
        @Body('role') role: 'ADMIN' | 'MEMBER',
    ) {
        return this.conversationsService.setMemberRole(userId, id, memberId, role);
    }

    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Post(':id/pin')
    pinMessage(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: PinMessageDto,
    ) {
        return this.conversationsService.pinMessage(userId, id, dto.messageId);
    }

    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Delete(':id/pin')
    unpinMessage(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.conversationsService.unpinMessage(userId, id);
    }

    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @Post('forward')
    forwardMessage(
        @CurrentUser('sub') userId: number,
        @Body() dto: ForwardMessageDto,
    ) {
        return this.conversationsService.forwardMessage(userId, dto.messageId, dto.targetConversationId);
    }

    // E2E key distribution — 30 req/min
    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @Post(':id/sender-keys')
    setGroupKeys(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: SetSenderKeysDto,
    ) {
        return this.conversationsService.setSenderKey(userId, id, dto.keys);
    }

    @Throttle({ default: { ttl: 60_000, limit: 60 } })
    @Get(':id/sender-keys/for-me')
    getMyGroupKey(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.conversationsService.getSenderKeysForMe(userId, id);
    }
}