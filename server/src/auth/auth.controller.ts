import {
    Controller,
    Post,
    Body,
    Res,
    Req,
    UseGuards,
    Get,
    Query,
    UnauthorizedException, Patch, Delete, Param, ParseIntPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import {ChangePasswordDto} from "./dto/changePassword.dto.js";
import {ForgotPasswordDto, ResetPasswordDto} from "./dto/passwordReset.dto.js";
import {ResendVerificationDto} from "./dto/resendVerification.dto.js";
import {DeleteAccountDto} from "./dto/deleteAccount.dto.js";
import {Disable2FADto, Enable2FADto} from "./dto/twoFactor.dto.js";

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Throttle({ default: { ttl: 60000, limit: 3 } })
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

    @Throttle({ default: { ttl: 60000, limit: 5 } })
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

    @SkipThrottle()
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

    @Post('logout')
    async logout(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const refreshToken = req.cookies['refreshToken'];
        if (refreshToken) {
            await this.authService.logout(refreshToken);
        }

        res.clearCookie('refreshToken', { path: '/' });
        return { message: 'Logged out successfully' };
    }

    @UseGuards(JwtAuthGuard)
    @Get('sessions')
    async getSessions(@CurrentUser('sub') userId: number) {
        return this.authService.getUserSessions(userId);
    }

    @Get('verify-email')
    async verify(
        @Query('token') token: string,
        @Res() res: Response,
    ) {
        const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';
        try {
            await this.authService.verifyEmail(token);
            return res.redirect(`${clientUrl}/auth/setup-recovery?verified=true`);
        } catch {
            return res.redirect(`${clientUrl}/auth/verify-pending?error=invalid-token`);
        }
    }

    @Throttle({ default: { ttl: 60000, limit: 3 } })
    @Post('resend-verification')
    async resendVerification(@Body() dto: ResendVerificationDto) {
        await this.authService.resendVerificationEmail(dto.email);
        return { message: 'If an unverified account with that email exists, a new verification link has been sent' };
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout-all')
    async logoutAll(@CurrentUser('sub') userId: number) {
        return this.authService.logoutAll(userId);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('sessions/:id')
    async terminateSession(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) sessionId: number,
    ) {
        return this.authService.terminateSession(userId, sessionId);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('account')
    async deleteAccount(
        @CurrentUser('sub') userId: number,
        @Body() dto: DeleteAccountDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        await this.authService.deleteAccount(userId, dto.password, dto.twoFactorCode);
        res.clearCookie('refreshToken', { path: '/' });
        return { message: 'Account deleted successfully' };
    }

    @UseGuards(JwtAuthGuard)
    @Patch('password')
    async changePassword(
        @CurrentUser('sub') userId: number,
        @Body() dto: ChangePasswordDto,
    ) {
        return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
    }

    @Throttle({ default: { ttl: 60000, limit: 3 } })
    @Post('forgot-password')
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        await this.authService.forgotPassword(dto.email);

        return { message: 'If an account with that email exists, a reset link has been sent' };
    }

    @Throttle({ default: { ttl: 60000, limit: 5 } })
    @Post('reset-password')
    async resetPassword(@Body() dto: ResetPasswordDto) {
        await this.authService.resetPassword(dto.token, dto.newPassword);
        return { message: 'Пароль успішно змінено. Тепер ви можете увійти.' };
    }

    // 2FA endpoints would go here
    @UseGuards(JwtAuthGuard)
    @Get('2fa/status')
    get2FAStatus(@CurrentUser('sub') userId: number) {
        return this.authService.get2FAStatus(userId);
    }

    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { ttl: 60000, limit: 5 } })
    @Post('2fa/setup')
    setup2FA(@CurrentUser('sub') userId: number) {
        return this.authService.setup2FA(userId);
    }

    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { ttl: 60000, limit: 10 } })
    @Post('2fa/enable')
    enable2FA(
        @CurrentUser('sub') userId: number,
        @Body() dto: Enable2FADto,
    ) {
        return this.authService.enable2FA(userId, dto.token);
    }

    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { ttl: 60000, limit: 5 } })
    @Post('2fa/disable')
    disable2FA(
        @CurrentUser('sub') userId: number,
        @Body() dto: Disable2FADto,
    ) {
        return this.authService.disable2FA(userId, dto.token, dto.password);
    }


    private setRefreshCookie(res: Response, token: string) {
        res.cookie('refreshToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/', // Обмежуємо куку лише шляхом оновлення
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 днів
        });
    }

    private extractMeta(req: Request) {
        return {
            ip: req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
        };
    }
}