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
import { UseGuards, Logger } from "@nestjs/common";
import { WsJwtGuard } from "./guards/ws-jwt.guard.js";
import {PrismaService} from "../prisma/prisma.service.js";
import {JwtService} from "@nestjs/jwt";

@WebSocketGateway({
    cors: { origin: "*" },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService
    ) {}
    @WebSocketServer() server: Server;
    private logger = new Logger("ChatGateway");

    // Calls when user opens the socket

    async handleConnection(client: Socket){
        try {
            const token = client.handshake.auth?.token || client.handshake.query?.token;
            if (!token) return client.disconnect();

            const payload = await this.jwtService.verify(token);
            const userId = payload.sub;

            client.data.user = {
                id: userId,
                nickname: payload.nickname || 'Unknown'
            };

            client.data.userId = userId;

            const roomId = `user_${payload.sub}`;
            client.join(roomId);

            client.data.userId = userId;

            await this.prisma.user.update({
                where: { id: userId },
                data: { isOnline: true },
            });

            this.server.emit('userStatusChanged', { userId, isOnline: true})

            this.logger.log(`User ${payload.sub} joined room: ${roomId}`)
            this.logger.log(`User ${userId} is now Online`)
        } catch (e) {
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket){
        const userId = client.data.userId;
        if (userId) {

            await this.prisma.user.update({
                where: { id: userId },
                data: { isOnline: false, lastSeen: new Date() }
            });


            this.server.emit('userStatusChanged', { userId, isOnline: false });

            this.logger.log(`User ${userId} disconnected and is now Offline`);
        }
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sendMessage')
    async handleMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { toId: number; text: string },
    ) {

        const sender = client.data.user;

        if (!sender || !sender.id) {
            this.logger.error('Sender not found in socket data');
            return;
        }

        const newMessage = await this.prisma.message.create({
            data: {
                content: data.text,
                senderId: sender.id,
                receiverId: data.toId,
            },
        });

        this.server.to(`user_${data.toId}`).emit('onMessage', {
            id: newMessage.id,
            fromNickname: sender.nickname,
            text: newMessage.content,
            sentAt: newMessage.createdAt,
        });

        client.emit('messageSent', {
            id: newMessage.id,
            text: newMessage.content,
            status: 'sent'
        });

        this.logger.log(`User ${sender.id} sent message to User ${data.toId}: "${data.text}"`)
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

}