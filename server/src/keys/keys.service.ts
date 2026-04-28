import {Injectable, NotFoundException, UnauthorizedException} from "@nestjs/common";
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

    async saveRecoveryKey(
        userId: number,
        encryptedBlob: string,
        salt: string,
        isReset: boolean,
        twoFactorCode?: string
    ) {
        if (isReset) {
            const user = await this.prisma.user.findUniqueOrThrow({
                where:  { id: userId },
                select: { twoFactorEnabled: true, twoFactorSecret: true },
            });
            if (user.twoFactorEnabled) {
                if (!twoFactorCode) throw new UnauthorizedException('Потрібен код 2FA');
                const { authenticator } = await import('@otplib/preset-default');
                if (!authenticator.check(twoFactorCode, user.twoFactorSecret!)) {
                    throw new UnauthorizedException('Невірний код 2FA');
                }
            }
        }

        return this.prisma.user.update({
            where: { id: userId },
            data:  { encryptedPrivateKey: encryptedBlob, privateKeySalt: salt },
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

    // ── V2 key bundle (X3DH) ────────────────────────────────────────────────

    async publishBundleV2(userId: number, bundle: string) {
        return this.prisma.userKeyBundleV2.upsert({
            where:  { userId },
            create: { userId, bundle },
            update: { bundle },
            select: { userId: true, updatedAt: true },
        });
    }

    async getBundleV2(userId: number) {
        const row = await this.prisma.userKeyBundleV2.findUnique({ where: { userId } });
        if (!row) throw new NotFoundException('V2 key bundle not found');
        return { userId: row.userId, bundle: row.bundle, updatedAt: row.updatedAt };
    }

    // ── V2 recovery (Argon2id params embedded in blob, no separate salt) ────

    async saveRecoveryV2(
        userId: number,
        encryptedBlob: string,
        isReset: boolean,
        twoFactorCode?: string,
    ) {
        if (isReset) {
            const user = await this.prisma.user.findUniqueOrThrow({
                where:  { id: userId },
                select: { twoFactorEnabled: true, twoFactorSecret: true },
            });
            if (user.twoFactorEnabled) {
                if (!twoFactorCode) throw new UnauthorizedException('Потрібен код 2FA');
                const { authenticator } = await import('@otplib/preset-default');
                if (!authenticator.check(twoFactorCode, user.twoFactorSecret!)) {
                    throw new UnauthorizedException('Невірний код 2FA');
                }
            }
        }

        return this.prisma.user.update({
            where:  { id: userId },
            data:   { encryptedPrivateKeyV2: encryptedBlob },
            select: { id: true },
        });
    }

    async getRecoveryV2(userId: number) {
        const user = await this.prisma.user.findUnique({
            where:  { id: userId },
            select: { encryptedPrivateKeyV2: true },
        });
        if (!user?.encryptedPrivateKeyV2) throw new NotFoundException('No v2 recovery key found');
        return { encryptedBlob: user.encryptedPrivateKeyV2 };
    }
}