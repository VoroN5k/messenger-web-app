import {
  BadRequestException,
  Body, Controller, Delete, forwardRef, Get, Inject, Param,
    ParseIntPipe, Patch, Post, Put, Query, UseGuards,
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
import {ChatGateway} from "../chat/chat.gateway.js";

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
    constructor(
        private readonly conversationsService: ConversationsService,
        @Inject(forwardRef(() => ChatGateway))
        private readonly chatGateway: ChatGateway,
    ) {}

    @SkipThrottle()
    @Get()
    getAll(
        @CurrentUser('sub') userId: number,
        @Query('skip') skip?: string,
        @Query('take') take?: string,
        @Query('archived') archived?: string,
    ) {
        const skipNum = skip ? Math.max(0, parseInt(skip, 10)) : 0;
        const takeNum = take ? Math.min(50, Math.max(1, parseInt(take, 10))) : 20;
        const showArchived = archived === 'true';
        return this.conversationsService.getMyConversations(userId, skipNum, takeNum, showArchived);
    }

    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Post('direct')
    createDirect(@CurrentUser('sub') userId: number, @Body() dto: CreateDirectDto) {
        return this.conversationsService.getOrCreateDirect(userId, dto.targetUserId);
    }

    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Post('group')
    async createGroup(@CurrentUser('sub') userId: number, @Body() dto: CreateGroupDto) {
        const conv = await this.conversationsService.createGroup(userId, dto);

        const otherMembers = conv.members
            .filter(m => m.userId !== userId)
            .map(m => m.userId);
        for (const memberId of otherMembers) {
            await this.chatGateway.notifyUserJoinRoom(memberId, conv.id);
        }
        return conv;
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

    // Pin / Archive in a sidebar
    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @Patch(':id/pin-chat')
    pinChat(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body('isPinned') isPinned: boolean,
    ) {
        return this.conversationsService.setChatPinned(userId, id, isPinned);
    }

    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @Patch(':id/archive')
    archiveChat(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body('isArchived') isArchived: boolean,
    ) {
        return this.conversationsService.setChatArchived(userId, id, isArchived);
    }

    @Throttle({ default: { ttl: 60_000, limit: 120 } })
    @Get(':id/messages')
    getMessages(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query('cursor') cursor?: string,
        @Query('after')  after?:  string,   // ← НОВЕ: завантажити новіші повідомлення
        @Query('around') around?: string,
    ) {
        if (around) return this.conversationsService.getMessagesAround(userId, id, parseInt(around, 10));
        if (after)  return this.conversationsService.getMessagesAfter(userId,  id, parseInt(after,  10));
        return this.conversationsService.getMessages(userId, id, cursor ? parseInt(cursor, 10) : undefined);
    }

    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Delete(':id/messages')
    clearMessages(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query('scope') scope: 'self' | 'both' = 'self',
    ) {
      if (scope !== 'self' && scope !== 'both') {
        throw new BadRequestException('Scope must be either "self" or "both"');
      }
      return this.conversationsService.clearMessages(userId, id, scope);
    }

    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @Get(':id/media')
    getMedia(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.conversationsService.getMediaFiles(userId, id);
    }

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
    async addMember(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AddMemberDto,
    ) {
        const member = await this.conversationsService.addMember(userId, id, dto.userId);
        await this.chatGateway.notifyUserJoinRoom(dto.userId, id);
        return member;
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
        return this.conversationsService.addPinnedMessage(userId, id, dto.messageId);
    }

    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Delete(':id/pin/:messageId')
    unpinMessage(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('messageId', ParseIntPipe) messageId: number,
    ) {
        return this.conversationsService.removePinnedMessage(userId, id, messageId);
    }

    @SkipThrottle()
    @Get(':id/pinned-messages')
    getPinnedMessages(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.conversationsService.getPinnedMessages(userId, id);
    }

    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @Post('forward')
    forwardMessage(
        @CurrentUser('sub') userId: number,
        @Body() dto: ForwardMessageDto,
    ) {
        return this.conversationsService.forwardMessage(userId, dto.messageId, dto.targetConversationId);
    }

    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Delete('sender-keys/mine-all')
    deleteAllMySenderKeys(@CurrentUser('sub') userId: number) {
        return this.conversationsService.deleteAllMySenderKeys(userId);
    }

    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @Post(':id/sender-keys')
    setGroupKeys(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: SetSenderKeysDto,
    ) {
        return this.conversationsService.setSenderKey(userId, id, dto.keys, dto.version ?? 1);
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