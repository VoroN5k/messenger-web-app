import {
    Controller,
    Post,
    Body,
    Res,
    Req,
    UseGuards,
    Get,
    Query,
    UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    /**
     * Реєстрація нового користувача.
     * Передаємо Request для витягування мета-даних сесії (IP, User-Agent).
     */
    @Post('register')
    async register(
        @Body() dto: RegisterDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const meta = this.extractMeta(req);
        const tokens = await this.authService.register(dto, meta);

        this.setRefreshCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    /**
     * Вхід у систему.
     */
    @Post('login')
    async login(
        @Body() dto: LoginDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const meta = this.extractMeta(req);
        const tokens = await this.authService.login(dto, meta);

        this.setRefreshCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    /**
     * Оновлення пари токенів.
     * Токен береться з HttpOnly Cookie для безпеки.
     */
    @Post('refresh')
    async refresh(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const refreshToken = req.cookies['refreshToken'];
        if (!refreshToken) throw new UnauthorizedException('Refresh token missing');

        const meta = this.extractMeta(req);
        const tokens = await this.authService.refresh(refreshToken, meta);

        this.setRefreshCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    /**
     * Вихід з поточної сесії.
     */
    @Post('logout')
    async logout(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const refreshToken = req.cookies['refreshToken'];
        if (refreshToken) {
            await this.authService.logout(refreshToken);
        }

        res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
        return { message: 'Logged out successfully' };
    }

    /**
     * Список активних сесій користувача.
     */
    @UseGuards(JwtAuthGuard)
    @Get('sessions')
    async getSessions(@CurrentUser('sub') userId: number) {
        return this.authService.getUserSessions(userId);
    }

    /**
     * Підтвердження Email через токен.
     */
    @Get('verify-email')
    async verify(@Query('token') token: string) {
        return this.authService.verifyEmail(token);
    }

    /**
     * Вихід зі всіх пристроїв.
     */
    @UseGuards(JwtAuthGuard)
    @Post('logout-all')
    async logoutAll(@CurrentUser('sub') userId: number) {
        return this.authService.logoutAll(userId);
    }

    // --- Private Helpers ---

    /**
     * Централізоване налаштування безпечних кук.
     */
    private setRefreshCookie(res: Response, token: string) {
        res.cookie('refreshToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth/refresh', // Обмежуємо куку лише шляхом оновлення
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 днів
        });
    }

    /**
     * Уніфіковане вилучення мета-даних запиту.
     */
    private extractMeta(req: Request) {
        return {
            ip: req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
        };
    }
}