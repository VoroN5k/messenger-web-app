import {
    BadRequestException,
    ConflictException,
    Injectable,
    UnauthorizedException,
    Logger, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JWTPayload } from './interfaces/jwt-payload.interface.js';
import { SessionMeta } from './interfaces/session-meta.interface.js';
import { generateToken, hashToken } from './utils/token.util.js';
import { EmailService } from './email/email.service.js';
import { authenticator } from '@otplib/preset-default';
import * as QRCode from 'qrcode';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    private readonly MAX_SESSIONS = 5;
    private readonly REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 днів
    private readonly RESET_TOKEN_EXPIRY_MS   = 60 * 60 * 1000;           // 1 година

    constructor(
        private readonly prisma:        PrismaService,
        private readonly jwtService:    JwtService,
        private readonly emailService:  EmailService,
    ) {}

    // REGISTER
    async register(dto: RegisterDto, meta: SessionMeta) {
        const { email, password, confirmPassword, nickname } = dto;

        if (password !== confirmPassword) {
            throw new BadRequestException('Passwords do not match');
        }

        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.user.findFirst({
                where: { OR: [{ email }, { nickname }] },
            });

            if (existing) {
                throw new ConflictException('User with this email or nickname already exists');
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const verifyToken    = generateToken();

            const user = await tx.user.create({
                data: {
                    email,
                    nickname,
                    password:        hashedPassword,
                    isEmailVerified: false,
                    emailVerifyToken: hashToken(verifyToken),
                },
            });

            await this.emailService.sendVerificationEmail(email, verifyToken);

            return this.issueTokens(user.id, meta, tx);
        });
    }

    // LOGIN
    async login(dto: LoginDto, meta: SessionMeta) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

        if (!user || !(await bcrypt.compare(dto.password, user.password))) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.isEmailVerified) {
            throw new UnauthorizedException('Please verify your email first');
        }

        return this.issueTokens(user.id, meta);
    }

    // REFRESH
    async refresh(rawRefreshToken: string, meta: SessionMeta) {
        const hashed = hashToken(rawRefreshToken);

        return this.prisma.$transaction(async (tx) => {
            const session = await tx.session.findUnique({
                where:   { refreshToken: hashed },
                include: { user: true },
            });

            if (!session) {
                this.logger.warn(
                    `Refresh token not found - possible reuse attack (hash: ${hashed.slice(0, 12)}…)`,
                );
                throw new UnauthorizedException('Invalid or expired refresh token');
            }

            if (session.expiresAt < new Date()) {
                await tx.session.delete({ where: { id: session.id } });
                throw new UnauthorizedException('Refresh token expired, please log in again');
            }

            return this.rotateSession(session.id, session.userId, meta, tx);
        });
    }

    // FORGOT PASSWORD
    async forgotPassword(email: string): Promise<void> {
        const user = await this.prisma.user.findUnique({ where: { email } });

        // Константний час відповіді щоб уникнути email enumeration (timing attack)
        const FIXED_DELAY_MS = 500;
        const start = Date.now();

        try {
            if (!user || !user.isEmailVerified) return;

            const rawToken = generateToken();
            const expires  = new Date(Date.now() + this.RESET_TOKEN_EXPIRY_MS);

            await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    passwordResetToken:   hashToken(rawToken),
                    passwordResetExpires: expires,
                },
            });

            await this.emailService.sendPasswordResetEmail(email, rawToken);
            this.logger.log(`Password reset email sent to ${email}`);
        } finally {
            // Завжди чекаємо однаковий час незалежно від того чи існує email
            const elapsed = Date.now() - start;
            if (elapsed < FIXED_DELAY_MS) {
                await sleep(FIXED_DELAY_MS - elapsed);
            }
        }
    }

    // RESET PASSWORD
    async resetPassword(token: string, newPassword: string): Promise<void> {
        const hashed = hashToken(token);

        const user = await this.prisma.user.findFirst({
            where: {
                passwordResetToken:   hashed,
                passwordResetExpires: { gt: new Date() },
            },
        });

        if (!user) throw new BadRequestException('Invalid or expired token');

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: user.id },
                data: {
                    password:             hashedPassword,
                    passwordResetToken:   null,
                    passwordResetExpires: null,
                },
            }),
            // Інвалідуємо всі сесії після скидання пароля
            this.prisma.session.deleteMany({ where: { userId: user.id } }),
        ]);

        this.logger.log(`Password reset successful for user: ${user.id}`);
    }

    // CHANGE PASSWORD
    async changePassword(userId: number, oldPass: string, newPass: string) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

        if (!(await bcrypt.compare(oldPass, user.password))) {
            throw new UnauthorizedException('Current password incorrect');
        }

        const hashedPassword = await bcrypt.hash(newPass, 10);

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: userId },
                data:  { password: hashedPassword },
            }),
            this.prisma.session.deleteMany({ where: { userId } }),
        ]);

        return { message: 'Password updated' };
    }

    // VERIFY EMAIL
    async verifyEmail(token: string) {
        const user = await this.prisma.user.findFirst({
            where: { emailVerifyToken: hashToken(token) },
        });
        if (!user) throw new BadRequestException('Invalid token');

        await this.prisma.user.update({
            where: { id: user.id },
            data:  { isEmailVerified: true, emailVerifyToken: null },
        });
        return { message: 'Email verified' };
    }

    async resendVerificationEmail(email: string): Promise<void> {
        // Fixed delay to prevent email enumeration (timing attack)
        const FIXED_DELAY_MS = 500;
        const start = Date.now();

        try {
            const user = await this.prisma.user.findUnique({ where: { email } });

            // Only resend if the account exists AND is NOT yet verified
            if (!user || user.isEmailVerified) return;

            const verifyToken = generateToken();

            await this.prisma.user.update({
                where: { id: user.id },
                data:  { emailVerifyToken: hashToken(verifyToken) },
            });

            await this.emailService.sendVerificationEmail(email, verifyToken);
            this.logger.log(`Verification email resent to ${email}`);
        } finally {
            const elapsed = Date.now() - start;
            if (elapsed < FIXED_DELAY_MS) await sleep(FIXED_DELAY_MS - elapsed);
        }
    }

    // LOGOUT
    async logout(rawRefreshToken: string) {
        await this.prisma.session.deleteMany({
            where: { refreshToken: hashToken(rawRefreshToken) },
        });
    }

    async logoutAll(userId: number) {
        await this.prisma.session.deleteMany({ where: { userId } });
    }

    async terminateSession(userId: number, sessionId: number): Promise<{ message: string }> {
        const session = await this.prisma.session.findUnique({
            where: { id: sessionId },
        });

        if(!session) return { message: 'Session not found or already terminated' };

        if (session.userId !== userId) {
            throw new ForbiddenException('Cannot terminate another user\'s session');
        }

        await this.prisma.session.delete({ where: { id: sessionId } });
        this.logger.log(`User ${userId} terminated session ${sessionId}`);
        return { message: 'Session terminated' };
    }

    async deleteAccount(userId: number, password: string, twoFactorCode?: string): Promise<void> {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

        const passwordValid = await bcrypt.compare(password, user.password);
        if (!passwordValid) {
            throw new UnauthorizedException('Password incorrect');
        }

        await this.verify2FAToken(userId, twoFactorCode);

        await this.prisma.user.delete({ where: { id: userId } });
        this.logger.log(`User ${userId} (${user.email}) deleted their account`);
    }

    // SESSIONS
    async getUserSessions(userId: number) {
        return this.prisma.session.findMany({
            where:   { userId },
            select:  {
                id: true, userAgent: true, ipAddress: true,
                createdAt: true, expiresAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // INTERNALS

    /**
     * Видає пару токенів і зберігає сесію.
     *
     * - accessToken  - короткоживучий JWT (15 хв). Несе payload для авторизації.
     * - refreshToken - випадкові 32 байти (crypto.randomBytes).
     *   У БД зберігається тільки SHA-256 хеш, сирий токен — тільки в куці.
     */
    private async issueTokens(userId: number, meta: SessionMeta, tx?: any) {
        const client    = tx || this.prisma;
        const userAgent = meta.userAgent || 'unknown';

        // Якщо для цього useragent вже є сесія — ротуємо її
        const existing = await client.session.findFirst({
            where: { userId, userAgent },
        });

        if (existing) {
            return this.rotateSession(existing.id, userId, meta, client);
        }

        // Якщо досягли ліміту сесій - видаляємо найстарішу
        const activeSessions = await client.session.findMany({
            where:   { userId },
            orderBy: { createdAt: 'asc' },
        });

        if (activeSessions.length >= this.MAX_SESSIONS) {
            await client.session.delete({ where: { id: activeSessions[0].id } });
        }

        const { accessToken, rawRefreshToken } = await this.generateTokens(userId, client);

        await client.session.create({
            data: {
                userId,
                refreshToken: hashToken(rawRefreshToken),
                userAgent,
                ipAddress: meta.ip || 'unknown',
                expiresAt: new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY_MS),
            },
        });

        return { accessToken, refreshToken: rawRefreshToken };
    }

    /**
     * Атомарно замінює хеш refresh token в існуючій сесії.
     * Старий токен одразу інвалідується - повторне використання неможливе.
     */
    private async rotateSession(
        sessionId: number,
        userId:    number,
        meta:      SessionMeta,
        client:    any,
    ) {
        const { accessToken, rawRefreshToken } = await this.generateTokens(userId, client);

        await client.session.update({
            where: { id: sessionId },
            data: {
                refreshToken: hashToken(rawRefreshToken),
                ipAddress:    meta.ip || 'unknown',
                expiresAt:    new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY_MS),
            },
        });

        return { accessToken, refreshToken: rawRefreshToken };
    }

    /**
     * Генерує:
     *   - accessToken: підписаний JWT з payload користувача
     *   - rawRefreshToken: криптографічно випадковий hex-рядок
     */
    private async generateTokens(userId: number, client?: any) {
        const db   = client || this.prisma;
        const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

        const payload: JWTPayload = {
            sub:      user.id,
            email:    user.email,
            nickname: user.nickname,
            role:     user.role,
            avatarUrl: user.avatarUrl ?? null,
        };

        return {
            accessToken:     this.jwtService.sign(payload, { expiresIn: '15m' }),
            rawRefreshToken: generateToken(),
        };
    }

    async get2FAStatus(userId: number) {
        const user = await this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { twoFactorEnabled: true },
        });
        return { enabled: user.twoFactorEnabled };
    }

    async setup2FA(userId: number): Promise<{ secret: string; qrCodeDataUrl: string; manualEntry: string}> {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

        const secret = authenticator.generateSecret(20); // 20 байт в base32
        const otpauthUrl = authenticator.keyuri(user.email, 'Messenger', secret);
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 256, margin: 2 });

        // Зберігаємо secret тимчасово ( 2FA ще не увімкнена ) / Save secret temporarily (2FA not enabled yet)
        await this.prisma.user.update({
            where: { id: userId },
            data:  { twoFactorSecret: secret, twoFactorEnabled: false },
        });

        return { secret, qrCodeDataUrl, manualEntry: secret}
    }

    async enable2FA(userId: number, token: string): Promise<void> {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        if (!user.twoFactorSecret) throw new BadRequestException('2FA не налаштовано. Спочатку викличте /2fa/setup'); // 2FA not set up. Call /2fa/setup first

        const isValid = authenticator.check(token, user.twoFactorSecret);
        if (!isValid) throw new BadRequestException('Невірний код. Перевірте час на пристрої'); // Invalid 2FA token

        await this.prisma.user.update({
            where: { id: userId },
            data:  { twoFactorEnabled: true },
        });
        this.logger.log(`User ${userId} enabled 2FA`);
    }

    async disable2FA(userId: number, token: string, password: string): Promise<void> {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

        if (!await bcrypt.compare(password, user.password)) {
            throw new UnauthorizedException('Невірний пароль');
        }
        if (user.twoFactorEnabled && user.twoFactorSecret) {
            const isValid = authenticator.check(token, user.twoFactorSecret);
            if (!isValid) throw new UnauthorizedException('Невірний код 2FA');
        }

        await this.prisma.user.update({
            where: { id: userId },
            data:  { twoFactorEnabled: false, twoFactorSecret: null },
        });
        this.logger.log(`User ${userId} disabled 2FA`);
    }

    async verify2FAToken(userId: number, token: string | undefined): Promise<void> {
        const user = await this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { twoFactorEnabled: true, twoFactorSecret: true },
        });
        if (!user.twoFactorEnabled) return; // 2FA не увімкнена, пропускаємо перевірку
        if(!token) throw new UnauthorizedException('Потрібен код 2FA'); // 2FA code required
        const isValid = authenticator.check(token, user.twoFactorSecret!);
        if (!isValid) throw new UnauthorizedException('Невірний код 2FA'); // Invalid 2FA code
    }

}


// Utility
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}