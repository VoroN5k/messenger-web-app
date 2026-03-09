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

            const token = client.handshake.auth?.token || client.handshake.query?.token;

            if (!token) {
                throw new WsException("Unauthorized: No token provided");
            }

            // Перевіряємо токен
            const payload = this.jwtService.verify(token);

            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });

            if (!user) {
                throw new WsException("Unauthorized: User not found");
            }

            client.data.user = user;
            return true;

        } catch (err) {
            this.logger.error(`Ws Auth Error: ${err.message}`);

            client.emit('auth_error', {
                message: err.message || 'Unauthorized',
                statusCode: 401
            });

            throw new WsException(err.message || "Unauthorized");
        }
    }
}