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

@WebSocketGateway({
    cors: { origin: "*" },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    constructor(private readonly prisma: PrismaService) {}
    @WebSocketServer() server: Server;
    private logger = new Logger("ChatGateway");

    // Calls when user opens the socket

    async handleConnection(client: Socket){
        this.logger.log(`Client trying to connect: ${client.id}`);
    }

    handleDisconnect(client: Socket){
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sendMessage')
    async handleMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: {toId: number; text: string },
    ) {
        const sender = client.data.user;

        // Save messages to DB via ORM
        const newMessage = await this.prisma.message.create({
            data: {
                content: data.text,
                senderId: sender.id,
                receiverId: data.toId,
            },
            include: {
                sender: {select: {nickname: true} }
            }
        });

        this.logger.log(`Saved message from ${sender.id} to ${data.toId}: ${data.text}`);

        // 2. Send to receiver if online
        this.server.to(`user_${data.toId}`).emit('onMessage', {
            id: newMessage.id,
            fromNickname: newMessage.sender.nickname,
            text: newMessage.content,
            sentAt: newMessage.createdAt,
        });

        client.emit('messageSent', {
            id: newMessage.id,
            status: 'sent'
        });
    }

}