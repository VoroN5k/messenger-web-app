import {Controller, Post, Body, Res, Req, UseGuards, Get} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import {RegisterDto} from "./dto/register.dto.js";
import {LoginDto} from "./dto/login.dto.js";
import type {Request, Response} from "express";
import {RefreshDto} from "./dto/refresh.dto.js";
import {JwtAuthGuard} from "./guards/jwt-auth.guard.js";
import {CurrentUser} from "./decorators/current-user.decorator.js";

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    register(@Body() dto: RegisterDto, @Req() req: Request) {
        return this.authService.register(dto, req);
    }

    @Post('login')
    async login (
        @Body() dto: LoginDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const tokens = await this.authService.login(dto, {
            ip: req.ip,
            userAgent: req.headers['user-agent'] || 'unknown',
        });

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            path: '/auth/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        return { accessToken: tokens.accessToken };
    }

    @Post('refresh')
    async refresh (@Body() dto: RefreshDto) {
        return this.authService.refresh(dto);
    }

    @Post('logout')
    async logout (@Body() dto: RefreshDto) {
        return this.authService.logout(dto);
    }

    @UseGuards(JwtAuthGuard)
    @Get('sessions')
    getSessions(@CurrentUser('sub') userId: number) {
        return this.authService.getUserSessions(userId);
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout-all')
    logoutAll(@CurrentUser('sub') userId: number) {
        return this.authService.logoutAll(userId);
    }

}
