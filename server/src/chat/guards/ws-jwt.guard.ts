import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { WsException } from "@nestjs/websockets";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Socket } from "socket.io"; // Додано імпорт типу Socket

@Injectable()
export class WsJwtGuard implements CanActivate {
    private readonly logger = new Logger(WsJwtGuard.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly prisma: PrismaService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const client: Socket = context.switchToWs().getClient();
        try {
            const token = client.data.currentToken
                || client.handshake.auth?.token
                || client.handshake.query?.token;

            if (!token) throw new WsException('Unauthorized: No token provided');

            let payload: any;
            try {
                payload = this.jwtService.verify(token);
            } catch (err: any) {

                if (err.name === 'TokenExpiredError') {
                    client.emit('auth_error', { code: 'TOKEN_EXPIRED', message: 'Token expired' });
                } else {
                    client.emit('auth_error', { code: 'INVALID_TOKEN', message: 'Invalid token' });
                }
                throw new WsException(err.message);
            }

            if (!client.data.user) throw new WsException('Unauthorized: User not found');

            client.data.user = {
                id:       payload.sub,
                nickname: payload.nickname,
                email:    payload.email,
                role:     payload.role,
            };
            return true;
        } catch (err) {
            throw new WsException(err.message || 'Unauthorized');
        }
    }
}