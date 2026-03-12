import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
    WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import {UseGuards, Logger} from "@nestjs/common";
import { WsJwtGuard } from "./guards/ws-jwt.guard.js";
import {PrismaService} from "../prisma/prisma.service.js";
import {JwtService} from "@nestjs/jwt";

@WebSocketGateway({
    cors: {
        origin: "http://localhost:3000",
        credentials: true,
    },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService
    ) {}

    private activeUsers = new Map<number, Set<string>>();
    @WebSocketServer() server: Server;
    private logger = new Logger("ChatGateway");

    // Calls when user opens the socket

    async handleConnection(client: Socket){
        try {
            const token = client.handshake.auth?.token || client.handshake.query?.token;
            if (!token) return client.disconnect();

            const payload = await this.jwtService.verify(token);
            const userId = payload.sub;

            client.data.currentToken = token;
            client.data.user = { id: userId, nickname: payload.nickname || 'Unknown' };
            client.data.userId = userId;

            let userSockets = this.activeUsers.get(userId);
            if (!userSockets) {
                userSockets = new Set<string>();
                this.activeUsers.set(userId, userSockets);
            }
            userSockets.add(client.id);

            client.join(`user_${userId}`);

            if (userSockets.size === 1) {
                await this.prisma.user.update({
                    where: { id: userId },
                    data: { isOnline: true },
                });

                this.server.emit(`userStatusChanged`, {userId, isOnline: true})
                this.logger.log(`User ${userId} connected`)
            }
        } catch (e) {
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket) {
        const userId = client.data.userId;
        if (!userId) return;

        const userSockets = this.activeUsers.get(userId);
        if (userSockets) {
            userSockets.delete(client.id);

            if (userSockets.size === 0) {
                this.activeUsers.delete(userId);

                await this.prisma.user.update({
                    where: { id: userId },
                    data: { isOnline: false, lastSeen: new Date() }
                });

                this.server.emit('userStatusChanged', { userId, isOnline: false });
                this.logger.log(`User ${userId} disconnected and is now Offline`);
            }
        }
    }

    @SubscribeMessage('updateToken')
    async handleUpdateToken(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { token: string},
    ) {
        try {
            if (!data?.token) throw new Error("No token provided");

            const payload = this.jwtService.verify(data.token);

            if (payload.sub !== client.data.userId) {
                this.logger.warn(
                    `Token substitution attempt: socket userId=${client.data.userId}, token sub=${payload.sub}`
                )
                client.disconnect();
                return;
            }

            client.data.currentToken = data.token;
            client.data.user = {id : payload.sub, nickname: payload.nickname};

            this.logger.log(`Token refreshed for user ${payload.sub}`);
            client.emit('tokenUpdated', { success: true });
        } catch (e) {
            this.logger.warn(`Token update failed for socket ${client.id}: ${e.message}`)
            client.emit('tokenUpdated', { success: false });
        }
    }


    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sendMessage')
    async handleMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { toId: number; content: string },
    ) {

        if (!data?.content?.trim()) return;
        if (!data?.toId || data.toId === client.data.user.id) return;
        if (data.content.length > 4000) return;

        const sender = client.data.user;

        if (!sender || !sender.id) {
            this.logger.error('Sender not found in socket data');
            return;
        }

        const newMessage = await this.prisma.message.create({
            data: {
                content: data.content,
                senderId: sender.id,
                receiverId: data.toId,
            },
        });

        this.server.to(`user_${data.toId}`).emit('onMessage', {
            id: newMessage.id,
            senderId: sender.id,
            content: newMessage.content,
            createdAt: newMessage.createdAt,
        });

        client.emit('messageSent', {
            id: newMessage.id,
            content: newMessage.content,
            status: 'sent'
        });

        this.logger.log(`User ${sender.id} sent message to User ${data.toId}: "${data.content}"`)
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('markAsRead')
    async handleMarkAsRead(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { senderId: number }
    ) {

        const userId = client.data.user?.id;

        if (!userId) return;


        await this.prisma.message.updateMany({
            where: {
                senderId: data.senderId,
                receiverId: userId,
                isRead: false,
            },
            data: { isRead: true },
        });


        this.server.to(`user_${data.senderId}`).emit('messagesRead', {
            readerId: userId,
            senderId: data.senderId
        });

        this.logger.log(`User ${userId} marked messages from ${data.senderId} as read`);
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('typing')
    async handleTyping(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: {toId: number, isTyping: boolean},
    ) {
        const sender = client.data.user;
        if (!sender) return;

        this.server.to(`user_${data.toId}`).emit('onTyping', {
            userId: sender.id,
            isTyping: data.isTyping
        })
    }


}