import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    async getAll(@Req() req) {
        const userId = req.user.sub;

        if (!userId) {
            console.error("ID not found in token payload", req.user);
        }

        return this.usersService.findAll(Number(userId));
    }
}