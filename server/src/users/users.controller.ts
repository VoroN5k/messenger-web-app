import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {CurrentUser} from "../auth/decorators/current-user.decorator.js";

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    async getAll(@CurrentUser('sub') userId: number) {

        return this.usersService.findAll(userId);
    }
}