import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import {RegisterDto} from "./dto/register.dto.js";
import {LoginDto} from "./dto/login.dto.js";

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('register')
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    async login (@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }
}
