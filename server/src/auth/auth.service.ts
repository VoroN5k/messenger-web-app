import {
    BadRequestException,
    ConflictException,
    Injectable,
    UnauthorizedException,
    Logger,
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

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    private readonly MAX_SESSIONS = 5;
    private readonly REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly emailService: EmailService,
    ) {}

    // --- REGISTER ---
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
            const verifyToken = generateToken();

            const user = await tx.user.create({
                data: {
                    email,
                    nickname,
                    password: hashedPassword,
                    isEmailVerified: false,
                    emailVerifyToken: hashToken(verifyToken),
                },
            });

            await this.emailService.sendVerificationEmail(email, verifyToken);

            return this.createSession(user.id, meta, tx);
        });
    }

    // --- LOGIN ---
    async login(dto: LoginDto, meta: SessionMeta) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

        if (!user || !(await bcrypt.compare(dto.password, user.password))) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.isEmailVerified) {
            throw new UnauthorizedException('Please verify your email first');
        }

        return this.createSession(user.id, meta);
    }

    // --- REFRESH (Security Optimized) ---
    async refresh(refreshToken: string, meta: SessionMeta) {
        let payload: JWTPayload;
        try {
            payload = this.jwtService.verify(refreshToken);
        } catch (e) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        const hashed = hashToken(refreshToken);

        return this.prisma.$transaction(async (tx) => {
            const session = await tx.session.findUnique({
                where: { refreshToken: hashed },
            });

            if (!session) {
                // TOKEN REUSE DETECTION
                this.logger.warn(`Potential token reuse attack! User ID: ${payload.sub}`);
                await tx.session.deleteMany({ where: { userId: payload.sub } });
                throw new UnauthorizedException('Security alert: session compromised');
            }

            if (session.expiresAt < new Date()) {
                await tx.session.delete({ where: { id: session.id } });
                throw new UnauthorizedException('Session expired');
            }

            // Видаляємо стару сесію і створюємо нову (Refresh Token Rotation)
            await tx.session.delete({ where: { id: session.id } });
            return this.createSession(payload.sub, meta, tx);
        });
    }

    // --- SESSION CORE ---
    private async createSession(userId: number, meta: SessionMeta, tx?: any) {
        const client = tx || this.prisma;

        // 1. Cleanup & Limit check
        await client.session.deleteMany({
            where: { OR: [{ userId, expiresAt: { lt: new Date() } }] }
        });

        const activeSessions = await client.session.count({ where: { userId } });
        if (activeSessions >= this.MAX_SESSIONS) {
            const oldest = await client.session.findFirst({
                where: { userId },
                orderBy: { createdAt: 'asc' },
            });
            if (oldest) await client.session.delete({ where: { id: oldest.id } });
        }

        // 2. Generate Tokens
        const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
        const payload: JWTPayload = {
            sub: user.id,
            email: user.email,
            nickname: user.nickname,
            role: user.role
        };

        const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
        const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

        // 3. Save Session
        await client.session.create({
            data: {
                userId,
                refreshToken: hashToken(refreshToken),
                userAgent: meta.userAgent || 'unknown',
                ipAddress: meta.ip || 'unknown',
                expiresAt: new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY),
            },
        });

        return { accessToken, refreshToken };
    }

    // --- PASSWORD MANAGEMENT ---
    async changePassword(userId: number, oldPass: string, newPass: string) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

        if (!(await bcrypt.compare(oldPass, user.password))) {
            throw new UnauthorizedException('Current password incorrect');
        }

        const hashedPassword = await bcrypt.hash(newPass, 10);

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: userId },
                data: { password: hashedPassword },
            }),
            this.prisma.session.deleteMany({ where: { userId } }), // Logout everywhere
        ]);

        return { message: 'Password updated successfully' };
    }

    // --- HELPER METHODS (Всі твої методи збережено) ---
    async verifyEmail(token: string) {
        const user = await this.prisma.user.findFirst({
            where: { emailVerifyToken: hashToken(token) },
        });
        if (!user) throw new BadRequestException('Invalid token');

        await this.prisma.user.update({
            where: { id: user.id },
            data: { isEmailVerified: true, emailVerifyToken: null },
        });
        return { message: 'Email verified' };
    }

    async logout(refreshToken: string) {
        await this.prisma.session.deleteMany({
            where: { refreshToken: hashToken(refreshToken) },
        });
    }

    async logoutAll(userId: number) {
        await this.prisma.session.deleteMany({ where: { userId } });
    }

    async getUserSessions(userId: number) {
        return this.prisma.session.findMany({
            where: { userId },
            select: { id: true, userAgent: true, ipAddress: true, createdAt: true },
        });
    }
}