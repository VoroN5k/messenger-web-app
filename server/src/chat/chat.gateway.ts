import {
    WebSocketGateway, SubscribeMessage, MessageBody,
    ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket }         from 'socket.io';
import { Logger, UseGuards }      from '@nestjs/common';
import { WsJwtGuard }             from './guards/ws-jwt.guard.js';
import { PrismaService }          from '../prisma/prisma.service.js';
import { JwtService }             from '@nestjs/jwt';
import { ConversationsService }   from '../conversations/conversations.service.js';
import { FriendsService }         from '../friends/friends.service.js';
import { PushService }            from '../push/push.service.js';

@WebSocketGateway({ cors: { origin: 'http://localhost:3000', credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private logger      = new Logger('ChatGateway');
    private activeUsers = new Map<number, Set<string>>();

    constructor(
        private readonly prisma:      PrismaService,
        private readonly jwtService:  JwtService,
        private readonly convService: ConversationsService,
        private readonly friends:     FriendsService,
        private readonly push:        PushService,
    ) {}

    // ── Connection ────────────────────────────────────────────────────────────
    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth?.token || client.handshake.query?.token;
            if (!token) return client.disconnect();

            const payload = this.jwtService.verify(token);
            const userId  = payload.sub as number;

            client.data.currentToken = token;
            client.data.userId       = userId;
            client.data.user         = { id: userId, nickname: payload.nickname };

            if (!this.activeUsers.has(userId)) this.activeUsers.set(userId, new Set());
            this.activeUsers.get(userId)!.add(client.id);

            // Personal room (friend requests, notifications)
            client.join(`user_${userId}`);

            // Join all conversation rooms
            const memberships = await this.prisma.conversationMember.findMany({
                where: { userId }, select: { conversationId: true },
            });
            for (const m of memberships) client.join(`conv_${m.conversationId}`);

            if (this.activeUsers.get(userId)!.size === 1) {
                await this.prisma.user.update({ where: { id: userId }, data: { isOnline: true } });
                this.server.emit('userStatusChanged', { userId, isOnline: true });
                this.logger.log(`User ${userId} connected`);
            }
        } catch {
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket) {
        const userId = client.data.userId as number | undefined;
        if (!userId) return;

        const sockets = this.activeUsers.get(userId);
        if (sockets) {
            sockets.delete(client.id);
            if (sockets.size === 0) {
                this.activeUsers.delete(userId);
                await this.prisma.user.update({
                    where: { id: userId },
                    data:  { isOnline: false, lastSeen: new Date() },
                });
                this.server.emit('userStatusChanged', { userId, isOnline: false });
                this.logger.log(`User ${userId} offline`);
            }
        }
    }

    // ── Token update ──────────────────────────────────────────────────────────
    @SubscribeMessage('updateToken')
    async handleUpdateToken(@ConnectedSocket() client: Socket, @MessageBody() data: { token: string }) {
        try {
            const payload = this.jwtService.verify(data.token);
            if (payload.sub !== client.data.userId) return client.disconnect();
            client.data.currentToken = data.token;
            client.emit('tokenUpdated', { success: true });
        } catch {
            client.emit('tokenUpdated', { success: false });
        }
    }

    // ── Send message ──────────────────────────────────────────────────────────
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sendMessage')
    async handleMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: {
            conversationId: number; content?: string;
            fileUrl?: string; fileName?: string; fileType?: string; fileSize?: number;
            replyToId?: number;
        },
    ) {
        const userId = client.data.user.id as number;
        if (!data?.conversationId) return;
        if (!data.content?.trim() && !data.fileUrl) return;

        try {
            const message = await this.convService.saveMessage(userId, data.conversationId, data);

            // Broadcast to everyone in room (including sender for optimistic replacement)
            this.server.to(`conv_${data.conversationId}`).emit('onMessage', message);

            // Push to offline members
            const members = await this.prisma.conversationMember.findMany({
                where: { conversationId: data.conversationId, userId: { not: userId } },
                select: { userId: true },
            });

            const bodyText = data.fileUrl
                ? `📎 ${data.fileName ?? 'Файл'}`
                : (data.content!.length > 100 ? data.content!.slice(0, 97) + '…' : data.content!);

            for (const m of members) {
                this.push.sendToUser(m.userId, {
                    title:    client.data.user.nickname,
                    body:     bodyText,
                    senderId: userId,
                    url:      '/chat',
                }).catch(() => {});
            }
        } catch (e: any) {
            client.emit('messageFailed', { error: e.message });
        }
    }

    // ── Mark as read ──────────────────────────────────────────────────────────
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('markAsRead')
    async handleMarkAsRead(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: number },
    ) {
        const userId = client.data.user.id as number;
        await this.convService.markAsRead(userId, data.conversationId);
        client.to(`conv_${data.conversationId}`).emit('conversationRead', {
            userId, conversationId: data.conversationId,
        });
    }

    // ── Typing ────────────────────────────────────────────────────────────────
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('typing')
    handleTyping(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: number; isTyping: boolean },
    ) {
        client.to(`conv_${data.conversationId}`).emit('onTyping', {
            userId:         client.data.user.id,
            nickname:       client.data.user.nickname,
            conversationId: data.conversationId,
            isTyping:       data.isTyping,
        });
    }

    // ── Delete / Edit / React ─────────────────────────────────────────────────
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('deleteMessage')
    async handleDelete(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: number }) {
        try {
            const deleted = await this.convService.deleteMessage(data.messageId, client.data.user.id);
            this.server.to(`conv_${deleted.conversationId}`).emit('messageDeleted', {
                messageId: deleted.id, conversationId: deleted.conversationId,
            });
        } catch (e: any) {
            client.emit('deleteFailed', { messageId: data.messageId, error: e.message });
        }
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('editMessage')
    async handleEdit(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { messageId: number; content: string },
    ) {
        try {
            const updated = await this.convService.editMessage(data.messageId, client.data.user.id, data.content);
            this.server.to(`conv_${updated.conversationId}`).emit('messageEdited', {
                messageId:      updated.id,
                content:        updated.content,
                editedAt:       updated.editedAt,
                conversationId: updated.conversationId,
            });
        } catch (e: any) {
            client.emit('editFailed', { messageId: data.messageId, error: e.message });
        }
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('toggleReaction')
    async handleReaction(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { messageId: number; emoji: string },
    ) {
        try {
            const { grouped, conversationId } = await this.convService.toggleReaction(
                data.messageId, client.data.user.id, data.emoji,
            );
            this.server.to(`conv_${conversationId}`).emit('reactionToggled', {
                messageId: data.messageId, reactions: grouped, conversationId,
            });
        } catch (e: any) {
            this.logger.warn(`Reaction failed: ${e.message}`);
        }
    }

    // ── Friend requests via WS ────────────────────────────────────────────────
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sendFriendRequest')
    async handleFriendRequest(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { receiverId: number },
    ) {
        try {
            const friendship = await this.friends.sendRequest(client.data.user.id, data.receiverId);
            this.server.to(`user_${data.receiverId}`).emit('friendRequestReceived', { friendship });
            client.emit('friendRequestSent', { friendship });
        } catch (e: any) {
            client.emit('friendRequestFailed', { error: e.message });
        }
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('respondFriendRequest')
    async handleRespondFriend(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { friendshipId: number; action: 'ACCEPTED' | 'DECLINED' },
    ) {
        try {
            const friendship = await this.friends.respond(client.data.user.id, data.friendshipId, data.action);
            this.server.to(`user_${friendship.senderId}`).emit('friendRequestResponded', {
                friendship, action: data.action,
            });
            client.emit('friendRequestResponded', { friendship, action: data.action });
        } catch (e: any) {
            client.emit('respondFailed', { error: e.message });
        }
    }

    // ── Join room after being added to conversation ───────────────────────────
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('joinConversation')
    handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: number }) {
        client.join(`conv_${data.conversationId}`);
        client.emit('joinedConversation', { conversationId: data.conversationId });
    }

    // Helper: notify a user's sockets to join a new room
    async notifyUserJoinRoom(userId: number, conversationId: number) {
        const sockets = await this.server.in(`user_${userId}`).fetchSockets();
        for (const s of sockets) s.join(`conv_${conversationId}`);
        this.server.to(`user_${userId}`).emit('addedToConversation', { conversationId });
    }

    // ── Call tracking ──────────────────────────────────────────────────────────────────
    private activeCalls = new Map<string, {
        callerId: number;
        calleeId: number;
        conversationId: number;
        callType: string;
    }>();

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('callUser')
    async handleCallUser(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: {
            callId: string;
            conversationId: number;
            targetUserId: number;
            callType: 'audio' | 'video';
        },
    ) {
        const callerId = client.data.user.id as number;
        const { callId, targetUserId, conversationId, callType } = data;

        if (this.activeCalls.has(callId)) return;

        this.activeCalls.set(callId, {
            callerId,
            calleeId: targetUserId,
            conversationId,
            callType,
        });

        const caller = await this.prisma.user.findUnique({
            where: { id: callerId },
            select: { nickname: true, avatarUrl: true },
        });

        this.server.to(`user_${targetUserId}`).emit('incomingCall', {
            callId,
            conversationId,
            callerId,
            callerName: caller?.nickname ?? 'Unknown',
            callerAvatar: caller?.avatarUrl ?? null,
            callType,
        });

        this.logger.log(`Call ${callId}: ${callerId} -> ${targetUserId} [${callType}]`);
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('callAccept')
    handleCallAccept(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { callId: string; callType: 'audio' | 'video' },
    ) {
        const call = this.activeCalls.get(data.callId);
        if (!call) return;

        this.server.to(`user_${call.callerId}`).emit('callAccepted', {
        callId: data.callId,
            callType: data.callType,
        });
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('callReject')
    handleCallReject(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { callId: string; conversationId: number },
    ) {
        const call = this.activeCalls.get(data.callId);
        if (!call) return;

        this.activeCalls.delete(data.callId);
        this.server.to(`user_${call.callerId}`).emit('callRejected', { callId: data.callId });
        this.logger.log(`Call ${data.callId} rejected`);
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('callEnd')
    handleCallEnd(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { callId: string; conversationId: number },
    ) {
        const call = this.activeCalls.get(data.callId);
        if (!call) return;

        this.activeCalls.delete(data.callId);

        const userId    = client.data.user.id as number;
        const remoteId  = userId === call.callerId ? call.calleeId : call.callerId;

        this.server.to(`user_${remoteId}`).emit('callEnded', { callId: data.callId });
        this.logger.log(`Call ${data.callId} ended by user ${userId}`);
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('callBusy')
    handleCallBusy(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { callId: string },
    ) {
        const call = this.activeCalls.get(data.callId);
        if (!call) return;

        this.activeCalls.delete(data.callId);
        this.server.to(`user_${call.callerId}`).emit('callBusy', { callId: data.callId });
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sdpOffer')
    handleSdpOffer(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { callId: string; offer: RTCSessionDescriptionInit },
    ) {
        const call = this.activeCalls.get(data.callId);
        if (!call) return;

        const userId = client.data.user.id as number;
        const remoteId = userId === call.callerId ? call.calleeId : call.callerId;

        this.server.to(`user_${remoteId}`).emit('sdpOffer', {
            callId: data.callId,
            offer: data.offer,
        });
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sdpAnswer')
    handleSdpAnswer(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { callId: string; answer: RTCSessionDescriptionInit },
    ) {
        const call   = this.activeCalls.get(data.callId);
        if (!call) return;

        const userId   = client.data.user.id as number;
        const remoteId = userId === call.callerId ? call.calleeId : call.callerId;

        this.server.to(`user_${remoteId}`).emit('sdpAnswer', {
            callId: data.callId,
            answer: data.answer,
        });
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('iceCandidate')
    handleIceCandidate(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { callId: string; candidate: RTCIceCandidateInit },
    ) {
        const call   = this.activeCalls.get(data.callId);
        if (!call) return;

        const userId   = client.data.user.id as number;
        const remoteId = userId === call.callerId ? call.calleeId : call.callerId;

        this.server.to(`user_${remoteId}`).emit('iceCandidate', {
            callId:    data.callId,
            candidate: data.candidate,
        });
    }
}