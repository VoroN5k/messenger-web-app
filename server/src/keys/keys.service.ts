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

    async saveRecoveryKey(userId: number, encryptedBlob: string, salt: string) {
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                encryptedPrivateKey: encryptedBlob,
                privateKeySalt: salt,
            },
            select: { id: true },
        });
    }

    async getRecoveryKey(userId: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { encryptedPrivateKey: true, privateKeySalt: true },
        });
        if(!user?.encryptedPrivateKey) throw new NotFoundException('No recovery key found');

        return {
            encryptedBlob: user.encryptedPrivateKey,
            salt: user.privateKeySalt!
        };
    }

    async hasRecoveryKey(userId: number): Promise<boolean> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { encryptedPrivateKey: true },
        });

        return !!user?.encryptedPrivateKey;
    }
}