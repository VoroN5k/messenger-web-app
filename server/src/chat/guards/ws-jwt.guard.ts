import { CanActivate, ExecutionContext, Injectable, Logger} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { WsException } from "@nestjs/websockets";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class WsJwtGuard implements CanActivate {
    private logger = new Logger("WsJwtGuard");

    constructor(
        private jwtService: JwtService,
        private prisma: PrismaService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            const client = context.switchToWs().getClient();

            const token = client.handshake.auth?.token || client.handshake.query?.token;

            if (!token) throw new WsException("Unauthorized: No token provided");

            const payload = this.jwtService.verify(token);
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });

            if (!user) throw new WsException("Unauthorized: User not found");

            client.data.user = user;
            return true;
        } catch ( err ) {
            this.logger.error(`Ws Auth Error: ${err.message}`);
            return false;
        }
    }
}
