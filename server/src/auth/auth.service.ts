import {BadRequestException, ConflictException, Injectable, UnauthorizedException} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { JWTPayload } from './types/jwt-payload.type.js';
import { Request } from 'express';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) {}

    // Token generation methods for access and refresh tokens, with different expiration times. The access token is short-lived, while the refresh token lasts longer.

    private generateAccessToken(payload: JWTPayload) {
        return this.jwtService.sign(payload, {
            expiresIn: '15m',
        });
    }

    private generateRefreshToken(payload: JWTPayload) {
        return this.jwtService.sign(payload, {
            expiresIn: '7d',
        });
    }

    // Register a new user by validating input, hashing the password, and creating a session with tokens. It checks for existing users and ensures passwords match.

    async register(dto: RegisterDto, req: Request) {
        const { email, password, confirmPassword, nickname } = dto;

        if (password !== confirmPassword) {
            throw new BadRequestException('Passwords do not match');
        }

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

        return this.createSession(user, req);
    }

    // Login by verifying credentials and creating a new session with access and refresh tokens. The refresh token is hashed and stored in the database.

    async login(dto: LoginDto, req: Request) {
        const { email, password } = dto;

        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (!user) throw new UnauthorizedException('Invalid credentials');

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) throw new UnauthorizedException('Invalid credentials');

        return this.createSession(user, req);
    }

    // Create a new session for the user, generating access and refresh tokens. The refresh token is hashed and stored in the database for later verification.

    private async createSession(user: any, req: Request) {
        const payload: JWTPayload = {
            sub: user.id,
            email: user.email,
            nickname: user.nickname,
        };

        const accessToken = this.generateAccessToken(payload);
        const refreshToken = this.generateRefreshToken(payload);

        const hashedRefresh = await bcrypt.hash(refreshToken, 10);

        await this.prisma.session.create({
            data: {
                userId: user.id,
                refreshToken: hashedRefresh,
                userAgent: req.headers['user-agent'] ?? null,
                ipAddress: req.ip ?? null,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return {
            user: {
                id: user.id,
                email: user.email,
                nickname: user.nickname,
            },
            accessToken,
            refreshToken,
        };
    }

    // Refresh the access token using a valid refresh token. This also rotates the refresh token for better security.

    async refresh(dto: RefreshDto) {
        const { refreshToken } = dto;

        let payload: JWTPayload;

        try {
            payload = this.jwtService.verify(refreshToken);
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const sessions = await this.prisma.session.findMany({
            where: { userId: payload.sub },
        });

        const currentSession = await this.findSession(
            refreshToken,
            sessions,
        );

        if (!currentSession)
            throw new UnauthorizedException('Session not found');

        if (currentSession.expiresAt < new Date())
            throw new UnauthorizedException('Session expired');


        await this.prisma.session.delete({
            where: { id: currentSession.id },
        });

        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
        });

        return this.createSession(user, {} as Request);
    }

    // helper to find the session matching the provided refresh token

    private async findSession(token: string, sessions: any[]) {
        for (const session of sessions) {
            const match = await bcrypt.compare(
                token,
                session.refreshToken,
            );
            if (match) return session;
        }
        return null;
    }

    // LOGOUT: invalidate the current refresh token by deleting the session

    async logout(dto: RefreshDto) {
        const { refreshToken } = dto;

        const sessions = await this.prisma.session.findMany();

        const session = await this.findSession(refreshToken, sessions);

        if (!session) throw new UnauthorizedException();

        await this.prisma.session.delete({
            where: { id: session.id },
        });

        return { message: 'Logged out successfully' };
    }
}