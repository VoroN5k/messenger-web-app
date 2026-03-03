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

@WebSocketGateway({
    cors: { origin: "*" },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
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

        this.logger.log(`Meesage from ${sender.nickname} to User ${data.toId}: ${data.text}`);

        this.server.emit('onMessage', {
            fromNickname: sender.nickname,
            text: data.text,
            sentAt: new Date(),
        })
    }

}