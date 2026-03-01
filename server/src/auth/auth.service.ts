import {BadRequestException, ConflictException, Injectable, UnauthorizedException} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { JWTPayload } from './interfaces/jwt-payload.interface.js';
import { SessionMeta } from './interfaces/session-meta.interface.js';
import { hashToken } from './utils/token.util.js';

@Injectable()
export class AuthService {
    private readonly MAX_SESSIONS = 5;

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) {}

    // ================= TOKEN GENERATION =================

    private generateAccessToken(payload: JWTPayload) {
        return this.jwtService.sign(payload, { expiresIn: '15m' });
    }

    private generateRefreshToken(payload: JWTPayload) {
        return this.jwtService.sign(payload, { expiresIn: '7d' });
    }

    // ================= REGISTER =================

    async register(dto: RegisterDto, meta: SessionMeta) {
        const { email, password, confirmPassword, nickname } = dto;

        if (password !== confirmPassword)
            throw new BadRequestException('Passwords do not match');

        const existing = await this.prisma.user.findFirst({
            where: { OR: [{ email }, { nickname }] },
        });

        if (existing) throw new ConflictException('User already exists');

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await this.prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                nickname,
            },
        });

        return this.createSession(user.id, meta);
    }

    // ================= LOGIN =================

    async login(dto: LoginDto, meta: SessionMeta) {
        const { email, password } = dto;

        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (!user) throw new UnauthorizedException('Invalid credentials');

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) throw new UnauthorizedException('Invalid credentials');

        return this.createSession(user.id, meta);
    }

    // ================= CREATE SESSION =================

    private async createSession(userId: number, meta: SessionMeta) {
        await this.cleanupExpiredSessions(userId);
        await this.enforceSessionLimit(userId);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) throw new UnauthorizedException('User not found');

        const payload: JWTPayload = {
            sub: user.id,
            email: user.email,
            nickname: user.nickname,
        };

        const accessToken = this.generateAccessToken(payload);
        const refreshToken = this.generateRefreshToken(payload);

        const hashedRefresh = hashToken(refreshToken);

        await this.prisma.session.create({
            data: {
                userId,
                refreshToken: hashedRefresh,
                userAgent: meta.userAgent ?? null,
                ipAddress: meta.ip ?? null,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return {
            accessToken,
            refreshToken,
        };
    }

    // ================= REFRESH =================

    async refresh(dto: RefreshDto) {
        const { refreshToken } = dto;

        let payload: JWTPayload;

        try {
            payload = this.jwtService.verify(refreshToken);
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const hashed = hashToken(refreshToken);

        const session = await this.prisma.session.findFirst({
            where: {
                userId: payload.sub,
                refreshToken: hashed,
            },
        });

        if (!session) {
            // reuse attack
            await this.prisma.session.deleteMany({
                where: { userId: payload.sub },
            });
            throw new UnauthorizedException('Token reuse detected');
        }

        if (session.expiresAt < new Date())
            throw new UnauthorizedException('Session expired');

        await this.prisma.session.delete({
            where: { id: session.id },
        });

        return this.createSession(payload.sub, {});
    }

    // ================= LOGOUT ONE =================

    async logout(dto: RefreshDto) {
        const { refreshToken } = dto;

        const payload = this.jwtService.verify(refreshToken);
        const hashed = hashToken(refreshToken);

        await this.prisma.session.deleteMany({
            where: {
                userId: payload.sub,
                refreshToken: hashed,
            },
        });

        return { message: 'Logged out successfully' };
    }

    // ================= LOGOUT ALL =================

    async logoutAll(userId: number) {
        await this.prisma.session.deleteMany({
            where: { userId },
        });

        return { message: 'Logged out from all devices' };
    }

    // ================= GET SESSIONS =================

    async getUserSessions(userId: number) {
        return this.prisma.session.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                userAgent: true,
                ipAddress: true,
                createdAt: true,
                expiresAt: true,
            },
        });
    }

    // ================= HELPERS =================

    private async cleanupExpiredSessions(userId: number) {
        await this.prisma.session.deleteMany({
            where: {
                userId,
                expiresAt: { lt: new Date() },
            },
        });
    }

    private async enforceSessionLimit(userId: number) {
        const count = await this.prisma.session.count({
            where: { userId },
        });

        if (count >= this.MAX_SESSIONS) {
            const oldest = await this.prisma.session.findFirst({
                where: { userId },
                orderBy: { createdAt: 'asc' },
            });

            if (oldest) {
                await this.prisma.session.delete({
                    where: { id: oldest.id },
                });
            }
        }
    }
}