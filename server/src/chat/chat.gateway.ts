import {
    WebSocketGateway, SubscribeMessage, MessageBody,
    ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket }         from 'socket.io';
import { Logger, UseGuards, OnModuleInit }      from '@nestjs/common';
import { WsJwtGuard }             from './guards/ws-jwt.guard.js';
import { PrismaService }          from '../prisma/prisma.service.js';
import { JwtService }             from '@nestjs/jwt';
import { ConversationsService }   from '../conversations/conversations.service.js';
import { FriendsService }         from '../friends/friends.service.js';
import { PushService }            from '../push/push.service.js';
import { WsRateLimiter }          from './ws-rate-limiter.js';

@WebSocketGateway({
    path: '/rt',
    cors: {
        origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
            const allowed = ['http://localhost:3000', process.env.CLIENT_URL].filter(Boolean);
            if (!origin || allowed.includes(origin)) callback(null, true);
            else callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
    },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
    @WebSocketServer() server: Server;
    private logger      = new Logger('ChatGateway');
    private activeUsers = new Map<number, Set<string>>();

    //Per-event rate limiters
    // sendMessage: 60 messages/min — prevents message flood
    private readonly msgLimiter= new WsRateLimiter(60, 60);
    // typing: 20/min — client debounces at 2.5s so this is very generous
    private readonly typingLimiter= new WsRateLimiter(20, 60);
    // reactions: 30/min
    private readonly reactLimiter= new WsRateLimiter(30, 60);
    // delete/edit: 30/min
    private readonly mutateLimiter= new WsRateLimiter(30, 60);
    // friend requests: 10/min
    private readonly friendLimiter= new WsRateLimiter(10, 60);
    // calls: 10/min — prevents call spam
    private readonly callLimiter= new WsRateLimiter(10, 60);
    // forward: 20/min
    private readonly forwardLimiter= new WsRateLimiter(20, 60);
    // device sync: 5/min — one session at a time is normal, prevent abuse
    private readonly syncLimiter = new WsRateLimiter(5, 60);

    constructor(
        private readonly prisma:      PrismaService,
        private readonly jwtService:  JwtService,
        private readonly convService: ConversationsService,
        private readonly friends:     FriendsService,
        private readonly push:        PushService,
    ) {
        // Clean up stale rate-limit windows and expired sync sessions every 5 minutes
        setInterval(() => {
            this.msgLimiter.cleanup();
            this.typingLimiter.cleanup();
            this.reactLimiter.cleanup();
            this.mutateLimiter.cleanup();
            this.friendLimiter.cleanup();
            this.callLimiter.cleanup();
            this.forwardLimiter.cleanup();
            this.syncLimiter.cleanup();
            this.purgeExpiredSyncSessions();
        }, 5 * 60 * 1000);
    }

    // Helpers
    private rateLimit(
        client: Socket,
        limiter: WsRateLimiter,
        event: string,
    ): boolean {
        const userId = client.data.user?.id as number | undefined;
        if (!userId) return false;

        if (!limiter.isAllowed(userId)) {
            client.emit('rateLimited', {
                event,
                retryAfter: limiter.retryAfter(userId),
                message: `Too many ${event} events. Try again in ${limiter.retryAfter(userId)}s.`,
            });
            this.logger.warn(`Rate limited user ${userId} on event "${event}"`);
            return false;
        }
        return true;
    }

    private scheduleMessageDelivery(messageId: number, conversationId: number, delayMs: number) {
        setTimeout(() => this.deliverScheduledMessage(messageId, conversationId), delayMs);
    }

    private async deliverScheduledMessage(messageId: number, conversationId: number) {
        try {
            const msg = await this.convService.getMessageById(messageId);
            if (!msg || msg.deletedAt) return;

            const senderStillMember = await this.prisma.conversationMember.findUnique({
                where: {
                    conversationId_userId: {
                        conversationId,
                        userId: Number(msg.senderId),
                    },
                },
            });

            if (!senderStillMember) {
                this.logger.warn(
                    `Scheduled message ${messageId}: sender ${msg.senderId} ` +
                    `is no longer a member of conv ${conversationId}. Cancelling delivery.`,
                );

                await this.prisma.message.update({
                    where: { id: messageId },
                    data: { deletedAt: new Date() },
                });
                return;
            }

            this.server.to(`conv_${conversationId}`).emit('onMessage', msg);

            // push notify
            const members = await this.prisma.conversationMember.findMany({
                where: { conversationId, userId: { not: Number(msg.senderId) } },
                select: { userId: true },
            });
            const bodyText = msg.fileUrl ? `📎 ${msg.fileName ?? 'Файл'}` : msg.content;
            for (const m of members) {
                this.push.sendToUser(m.userId, {
                    title: 'Нове повідомлення',
                    body: '🔒 Зашифроване повідомлення',
                    senderId: Number(msg.senderId),
                    url: '/chat',
                }).catch(() => {});
            }
        } catch (e: any) {
            this.logger.warn(`Failed to deliver scheduled message ${messageId}: ${e.message}`);
        }
    }

    async onModuleInit() {
        try {
            const pending = await this.convService.getPendingScheduledMessages();
            for (const msg of pending) {
                const delay = new Date(msg.scheduledAt!).getTime() - Date.now();
                if (delay > 0) {
                    this.scheduleMessageDelivery(msg.id, msg.conversationId, delay);
                } else {
                    // Overdue - deliver immediately
                    this.deliverScheduledMessage(msg.id, msg.conversationId);
                }
            }
            this.logger.log(`Reloaded ${pending.length} pending scheduled messages`);
        } catch (e : any) {
            this.logger.warn(`Failed to reload scheduled messages: ${e.message}`);
        }
    }

    // Connection
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

            client.join(`user_${userId}`);

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

        // Abort any in-progress sync session this socket is part of
        for (const [sessionId, session] of this.syncSessions.entries()) {
            if (session.sourceSocketId === client.id || session.targetSocketId === client.id) {
                this.syncSessions.delete(sessionId);
                const peerSocketId = session.sourceSocketId === client.id
                    ? session.targetSocketId
                    : session.sourceSocketId;
                if (peerSocketId) {
                    this.server.to(peerSocketId).emit('deviceSyncAborted', {
                        sessionId,
                        reason: 'peer_disconnected',
                    });
                }
                this.logger.log(`Sync session ${sessionId} aborted: socket ${client.id} disconnected`);
            }
        }

        for (const [callId, call] of this.activeCalls.entries()) {
            if (call.callerId === userId || call.calleeId === userId) {
                const remoteId = call.callerId === userId ? call.calleeId : call.callerId;
                this.server.to(`user_${remoteId}`).emit('callEnded', { callId });
                this.activeCalls.delete(callId);
                this.logger.log(`Call ${callId} ended due to disconnect of user ${userId}`);
            }
        }

        const sockets = this.activeUsers.get(userId);
        if (sockets) {
            sockets.delete(client.id);
            if (sockets.size === 0) {
                this.activeUsers.delete(userId);
                await this.prisma.user.updateMany({
                    where: { id: userId },
                    data:  { isOnline: false, lastSeen: new Date() },
                });
                this.server.emit('userStatusChanged', { userId, isOnline: false });
                this.logger.log(`User ${userId} offline`);
            }
        }
    }

    // Token update
    @SubscribeMessage('updateToken')
    async handleUpdateToken(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { token: string },
    ) {
        try {
            const payload = this.jwtService.verify(data.token);
            if (payload.sub !== client.data.userId) return client.disconnect();
            client.data.currentToken = data.token;
            client.emit('tokenUpdated', { success: true });
        } catch {
            client.emit('tokenUpdated', { success: false });
        }
    }

    // Send message
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sendMessage')
    async handleMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: {
            conversationId: number; content?: string;
            fileUrl?: string; fileName?: string; fileType?: string; fileSize?: number;
            replyToId?: number; metadata?: string; scheduledAt?: string | null;
            senderDeviceId?: number;
            envelopes?: Array<{ deviceId: number; ciphertext: string }>;
        },
    ) {
        const MAX_SCHEDULE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
        const MAX_CONTENT  = 4096;
        const MAX_FILENAME = 255;
        const MAX_FILETYPE = 127;


        if (!this.rateLimit(client, this.msgLimiter, 'sendMessage')) return;
        const userId = client.data.user.id as number;
        if (!data?.conversationId) return;
        if (!data.content?.trim() && !data.fileUrl) return;

        if (data.content && data.content.length > MAX_CONTENT) {
            client.emit('messageFailed', { error: 'Message too long (max 4096 chars)' });
            return;
        }
        if (data.fileName && data.fileName.length > MAX_FILENAME) {
            client.emit('messageFailed', { error: 'File name too long' });
            return;
        }
        if (data.fileType && data.fileType.length > MAX_FILETYPE) {
            client.emit('messageFailed', { error: 'Invalid file type' });
            return;
        }
        // fileSize перевірка (10MB)
        if (data.fileSize && data.fileSize > 10 * 1024 * 1024) {
            client.emit('messageFailed', { error: 'File size exceeds limit' });
            return;
        }

        const rawScheduled = data.scheduledAt ? new Date(data.scheduledAt) : null;
        if (rawScheduled && isNaN(rawScheduled.getTime())) {
            client.emit('messageFailed', { error: 'Invalid scheduledAt' });
            return;
        }
        if (rawScheduled && rawScheduled.getTime() - Date.now() > MAX_SCHEDULE_MS) {
            client.emit('messageFailed', { error: 'scheduledAt too far in the future (max 30 days)' });
            return;
        }



        try {
            const scheduledAt = rawScheduled && rawScheduled > new Date() ? rawScheduled : null;
            const isScheduled = scheduledAt && scheduledAt > new Date();

            const message = await this.convService.saveMessage(userId, data.conversationId, {
                ...data,
                scheduledAt:    scheduledAt ?? null,
                senderDeviceId: data.senderDeviceId,
                envelopes:      data.envelopes,
            });

            if (isScheduled) {
                // Only emit back to the sender with a special event (they see their pending message)
                client.emit('messageScheduled', message);

                // Schedule delivery to the room
                const delayMs = scheduledAt.getTime() - Date.now();
                this.scheduleMessageDelivery(message.id!, data.conversationId, delayMs);
            } else {
                // Normal immediate delivery
                this.server.to(`conv_${data.conversationId}`).emit('onMessage', message);

                const members = await this.prisma.conversationMember.findMany({
                    where: { conversationId: data.conversationId, userId: { not: userId } },
                    select: { userId: true },
                });

                const pushBody = data.fileUrl
                    ? `📎 ${data.fileName ?? 'Файл'}`
                    : '🔒 Зашифроване повідомлення';
                for (const m of members) {
                    this.push.sendToUser(m.userId, {
                        title: client.data.user.nickname,
                        body: pushBody,
                        senderId: userId,
                        url: '/chat',
                    }, this.server).catch(() => {});
                }
            }
        } catch (e: any) {
            client.emit('messageFailed', { error: e.message });
        }
    }

    // Mark as read
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

    // Typing
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('typing')
    handleTyping(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: number; isTyping: boolean },
    ) {
        if (!this.rateLimit(client, this.typingLimiter, 'typing')) return;

        client.to(`conv_${data.conversationId}`).emit('onTyping', {
            userId:         client.data.user.id,
            nickname:       client.data.user.nickname,
            conversationId: data.conversationId,
            isTyping:       data.isTyping,
        });
    }

    // Delete / Edit / React
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('deleteMessage')
    async handleDelete(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { messageId: number },
    ) {
        if (!this.rateLimit(client, this.mutateLimiter, 'deleteMessage')) return;

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
        if (!this.rateLimit(client, this.mutateLimiter, 'editMessage')) return;

        try {
            const updated = await this.convService.editMessage(
                data.messageId, client.data.user.id, data.content,
            );
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
        if (!this.rateLimit(client, this.reactLimiter, 'toggleReaction')) return;

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

    // Friend requests
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sendFriendRequest')
    async handleFriendRequest(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { receiverId: number },
    ) {
        if (!this.rateLimit(client, this.friendLimiter, 'sendFriendRequest')) return;

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
        if (!this.rateLimit(client, this.friendLimiter, 'respondFriendRequest')) return;

        try {
            const friendship = await this.friends.respond(
                client.data.user.id, data.friendshipId, data.action,
            );
            this.server.to(`user_${friendship.senderId}`).emit('friendRequestResponded', {
                friendship, action: data.action,
            });
            client.emit('friendRequestResponded', { friendship, action: data.action });
        } catch (e: any) {
            client.emit('respondFailed', { error: e.message });
        }
    }

    // Join room
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('joinConversation')
    handleJoin(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: number },
    ) {
        client.join(`conv_${data.conversationId}`);
        client.emit('joinedConversation', { conversationId: data.conversationId });
    }

    async notifyUserJoinRoom(userId: number, conversationId: number) {
        const sockets = await this.server.in(`user_${userId}`).fetchSockets();
        for (const s of sockets) s.join(`conv_${conversationId}`);
        this.server.to(`user_${userId}`).emit('addedToConversation', { conversationId });
    }

    // Calls
    private activeCalls = new Map<string, {
        callerId: number; calleeId: number;
        conversationId: number; callType: string;
    }>();

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('callUser')
    async handleCallUser(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: {
            callId: string; conversationId: number;
            targetUserId: number; callType: 'audio' | 'video';
        },
    ) {
        if (!this.rateLimit(client, this.callLimiter, 'callUser')) return;

        const callerId = client.data.user.id as number;
        const { callId, targetUserId, conversationId, callType } = data;
        if (this.activeCalls.has(callId)) return;

        this.activeCalls.set(callId, { callerId, calleeId: targetUserId, conversationId, callType });

        const caller = await this.prisma.user.findUnique({
            where: { id: callerId },
            select: { nickname: true, avatarUrl: true },
        });

        this.server.to(`user_${targetUserId}`).emit('incomingCall', {
            callId, conversationId, callerId,
            callerName:   caller?.nickname  ?? 'Unknown',
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
            callId: data.callId, callType: data.callType,
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
        const userId   = client.data.user.id as number;
        const remoteId = userId === call.callerId ? call.calleeId : call.callerId;
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
        const userId   = client.data.user.id as number;
        const remoteId = userId === call.callerId ? call.calleeId : call.callerId;
        this.server.to(`user_${remoteId}`).emit('sdpOffer', { callId: data.callId, offer: data.offer });
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sdpAnswer')
    handleSdpAnswer(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { callId: string; answer: RTCSessionDescriptionInit },
    ) {
        const call = this.activeCalls.get(data.callId);
        if (!call) return;
        const userId   = client.data.user.id as number;
        const remoteId = userId === call.callerId ? call.calleeId : call.callerId;
        this.server.to(`user_${remoteId}`).emit('sdpAnswer', { callId: data.callId, answer: data.answer });
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('iceCandidate')
    handleIceCandidate(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { callId: string; candidate: RTCIceCandidateInit },
    ) {
        const call = this.activeCalls.get(data.callId);
        if (!call) return;
        const userId   = client.data.user.id as number;
        const remoteId = userId === call.callerId ? call.calleeId : call.callerId;
        this.server.to(`user_${remoteId}`).emit('iceCandidate', {
            callId: data.callId, candidate: data.candidate,
        });
    }

    // Pin / Unpin
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('pinMessage')
    async handlePin(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: number; messageId: number },
    ) {
        if (!this.rateLimit(client, this.mutateLimiter, 'pinMessage')) return;

        try {
            const result = await this.convService.addPinnedMessage(
                client.data.user.id, data.conversationId, data.messageId,
            );
            this.server.to(`conv_${data.conversationId}`).emit('messagePinned', {
                conversationId:  data.conversationId,
                pinnedMessageId: result.pinned.messageId,
                pinnedMessage:   result.pinned.message,
                pinnedCount: result.pinnedCount,
            });
        } catch (e: any) {
            client.emit('pinFailed', { error: e.message });
        }
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('unpinMessage')
    async handleUnpin(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: number; messageId: number; },
    ) {
        if (!this.rateLimit(client, this.mutateLimiter, 'unpinMessage')) return;

        try {
            await this.convService.removePinnedMessage(client.data.user.id, data.conversationId, data.messageId);
            this.server.to(`conv_${data.conversationId}`).emit('messageUnpinned', {
                conversationId: data.conversationId,
            });
        } catch (e: any) {
            client.emit('unpinFailed', { error: e.message });
        }
    }

    // Sender key redistribution relay
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('requestSenderKeyRedistribution')
    async handleRequestSenderKeyRedistribution(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: number; targetUserId: number },
    ) {
        try {
            await this.prisma.conversationMember.findUniqueOrThrow({
                where: { conversationId_userId: { conversationId: data.conversationId, userId: client.data.userId } },
            });
            this.server.to(`user_${data.targetUserId}`).emit('senderKeyRedistributionRequested', {
                conversationId: data.conversationId,
                requesterId: client.data.userId,
            });
        } catch {}
    }

    // Key rotation relay — when a user regenerates their E2E keypair,
    // notify all online peers so they drop their cached ECDH session key.
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('notifyKeyRotated')
    handleKeyRotated(@ConnectedSocket() client: Socket) {
        const userId = client.data.userId;
        client.broadcast.emit('peerKeyRotated', { userId });
    }

    // Forward
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('forwardMessage')
    async handleForwardMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: {
            messageId: number;
            targetConversationId: number;
            reEncryptedContent?: string;
        },
    ) {
        if (!this.rateLimit(client, this.forwardLimiter, 'forwardMessage')) return;

        try {
            const msg = await this.convService.forwardMessage(
                client.data.user.id,
                data.messageId,
                data.targetConversationId,
                data.reEncryptedContent,
            );
            this.server.to(`conv_${data.targetConversationId}`).emit('onMessage', msg);
        } catch (e: any) {
            client.emit('forwardFailed', { error: e.message });
        }
    }

    // ── Device Sync (VSP-1) ────────────────────────────────────────────────────
    //
    // Secure history transfer between two devices of the same user account.
    //
    // Security model:
    //   - Both sockets MUST share the same authenticated userId (JWT-verified).
    //   - The OTP from the QR code is NEVER transmitted here; it stays on-device.
    //   - The server routes ephemeral X25519 public keys and WebRTC signaling
    //     but cannot derive the VSP-1 session key without the OTP.
    //   - Sessions expire after SYNC_SESSION_TTL_MS regardless of activity.
    //   - Only two participants: source (creator) + target (joiner).

    private static readonly SYNC_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
    private static readonly SESSION_ID_RE = /^[0-9a-f]{32}$/;    // 16 bytes hex

    private syncSessions = new Map<string, {
        userId: number;
        sourceSocketId: string;
        targetSocketId?: string;
        expiresAt: number;
    }>();

    /** Remove all sessions past their TTL. Called from the cleanup interval. */
    private purgeExpiredSyncSessions(): void {
        const now = Date.now();
        for (const [id, session] of this.syncSessions.entries()) {
            if (session.expiresAt <= now) {
                this.syncSessions.delete(id);
                this.logger.debug(`Purged expired sync session ${id}`);
            }
        }
    }

    /**
     * Source device advertises a new sync session.
     *
     * Payload:
     *   sessionId  – 32 hex chars (16 random bytes), also embedded in QR code
     *   ekSource   – base64url-encoded 32-byte ephemeral X25519 public key
     *   sdpOffer   – WebRTC SDP offer from the source device
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('deviceSyncStart')
    handleDeviceSyncStart(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string; ekSource: string; sdpOffer: RTCSessionDescriptionInit },
    ) {
        if (!this.rateLimit(client, this.syncLimiter, 'deviceSyncStart')) return;

        const userId = client.data.user.id as number;

        if (!ChatGateway.SESSION_ID_RE.test(data.sessionId)) {
            client.emit('deviceSyncError', { sessionId: data.sessionId, reason: 'invalid_session_id' });
            return;
        }
        if (this.syncSessions.has(data.sessionId)) {
            // Duplicate session ID — either a retry or a collision (astronomically unlikely)
            client.emit('deviceSyncError', { sessionId: data.sessionId, reason: 'session_exists' });
            return;
        }

        this.syncSessions.set(data.sessionId, {
            userId,
            sourceSocketId: client.id,
            expiresAt: Date.now() + ChatGateway.SYNC_SESSION_TTL_MS,
        });

        client.join(`dsync_${data.sessionId}`);
        client.emit('deviceSyncReady', { sessionId: data.sessionId });
        this.logger.log(`Sync session ${data.sessionId} created by user ${userId}`);
    }

    /**
     * Target device (same user, different socket) joins the session.
     *
     * Payload:
     *   sessionId  – must match an existing session belonging to this userId
     *   ekTarget   – base64url-encoded 32-byte ephemeral X25519 public key
     *   sdpAnswer  – WebRTC SDP answer
     *
     * If all checks pass, relays ekSource + sdpOffer to the target and
     * ekTarget + sdpAnswer to the source so both can complete VSP-1 + WebRTC.
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('deviceSyncAnswer')
    async handleDeviceSyncAnswer(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string; ekTarget: string; sdpAnswer: RTCSessionDescriptionInit },
    ) {
        if (!this.rateLimit(client, this.syncLimiter, 'deviceSyncAnswer')) return;

        const userId = client.data.user.id as number;
        const session = this.syncSessions.get(data.sessionId);

        // All guard clauses in one block — any failure leaks nothing about
        // other users' sessions because we only expose 'not_found' / 'not_available'.
        if (!session || session.expiresAt <= Date.now()) {
            client.emit('deviceSyncError', { sessionId: data.sessionId, reason: 'not_found' });
            return;
        }
        if (session.userId !== userId) {
            // Different user trying to hijack another user's session
            client.emit('deviceSyncError', { sessionId: data.sessionId, reason: 'not_found' });
            this.logger.warn(
                `Sync session ${data.sessionId}: user ${userId} tried to join session owned by ${session.userId}`,
            );
            return;
        }
        if (session.targetSocketId) {
            // A third device is trying to join — not allowed
            client.emit('deviceSyncError', { sessionId: data.sessionId, reason: 'not_available' });
            return;
        }
        if (session.sourceSocketId === client.id) {
            // Source cannot answer its own session
            client.emit('deviceSyncError', { sessionId: data.sessionId, reason: 'not_available' });
            return;
        }

        session.targetSocketId = client.id;
        client.join(`dsync_${data.sessionId}`);

        // Retrieve the ekSource from the source socket's stored data.
        // We ask the source to re-emit it so we don't store X25519 keys server-side.
        // Relay sdpAnswer to source, then source will emit its ekSource back.
        this.server.to(session.sourceSocketId).emit('deviceSyncPeerJoined', {
            sessionId: data.sessionId,
            ekTarget: data.ekTarget,
            sdpAnswer: data.sdpAnswer,
        });

        client.emit('deviceSyncJoined', { sessionId: data.sessionId });
        this.logger.log(`Sync session ${data.sessionId}: target joined (user ${userId})`);
    }

    /**
     * Source responds to 'deviceSyncPeerJoined' by sending its ekSource to the target.
     * This keeps X25519 public keys flowing peer-to-peer through the server without
     * the server needing to store them.
     *
     * Payload:
     *   sessionId – must match a session where this socket is the source
     *   ekSource  – base64url X25519 public key (same value as in deviceSyncStart)
     *   sdpOffer  – SDP offer (same value as in deviceSyncStart)
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('deviceSyncRelayOffer')
    handleDeviceSyncRelayOffer(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string; ekSource: string; sdpOffer: RTCSessionDescriptionInit },
    ) {
        const session = this.syncSessions.get(data.sessionId);
        if (!session || session.sourceSocketId !== client.id || !session.targetSocketId) return;

        this.server.to(session.targetSocketId).emit('deviceSyncOffer', {
            sessionId: data.sessionId,
            ekSource: data.ekSource,
            sdpOffer: data.sdpOffer,
        });
    }

    /**
     * Relay a WebRTC ICE candidate between source and target.
     *
     * Only participants of the session (source or target socket) may send candidates.
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('deviceSyncIce')
    handleDeviceSyncIce(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string; candidate: RTCIceCandidateInit },
    ) {
        const session = this.syncSessions.get(data.sessionId);
        if (!session || session.expiresAt <= Date.now()) return;

        const isSource = session.sourceSocketId === client.id;
        const isTarget = session.targetSocketId === client.id;
        if (!isSource && !isTarget) return; // not a participant — silently drop

        const peerSocketId = isSource ? session.targetSocketId : session.sourceSocketId;
        if (!peerSocketId) return; // target not yet joined

        this.server.to(peerSocketId).emit('deviceSyncIce', {
            sessionId: data.sessionId,
            candidate: data.candidate,
        });
    }

    /**
     * Either participant can abort the session at any time.
     * The peer is notified and the session is deleted.
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('deviceSyncAbort')
    handleDeviceSyncAbort(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string },
    ) {
        const session = this.syncSessions.get(data.sessionId);
        if (!session) return;

        const isSource = session.sourceSocketId === client.id;
        const isTarget = session.targetSocketId === client.id;
        if (!isSource && !isTarget) return;

        this.syncSessions.delete(data.sessionId);

        const peerSocketId = isSource ? session.targetSocketId : session.sourceSocketId;
        if (peerSocketId) {
            this.server.to(peerSocketId).emit('deviceSyncAborted', {
                sessionId: data.sessionId,
                reason: 'peer_aborted',
            });
        }

        client.emit('deviceSyncAborted', { sessionId: data.sessionId, reason: 'self_aborted' });
        this.logger.log(`Sync session ${data.sessionId} aborted by socket ${client.id}`);
    }
}