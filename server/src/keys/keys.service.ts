import {Injectable, NotFoundException} from "@nestjs/common";
import {PrismaService} from "../prisma/prisma.service.js";

@Injectable()
export class KeysService {
    constructor(private readonly prisma: PrismaService) {}

    async publishKey(userId: number, publicKey: string) {
        return this.prisma.userPublicKey.upsert({
            where: { userId },
            create: { userId, publicKey },
            update: { publicKey },
        });
    }

    async getKey(userId: number) {
        const k = await this.prisma.userPublicKey.findUnique({where: { userId }});
        if (!k) throw new NotFoundException('Public key not found');
        // return only public key
        return { userId: k.userId, publicKey: k.publicKey, updatedAt: k.updatedAt }
    }
}