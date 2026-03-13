import {
    Controller,
    Get,
    UseGuards,
    Req,
    Post,
    UseInterceptors,
    UploadedFile,
    BadRequestException
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {CurrentUser} from "../auth/decorators/current-user.decorator.js";
import {FileInterceptor} from "@nestjs/platform-express";
import {memoryStorage} from "multer";
import {UploadService} from "../upload/upload.service.js";

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly uploadService: UploadService
    ) {}

    @Get()
    async getAll(@CurrentUser('sub') userId: number) {

        return this.usersService.findAll(userId);
    }

    @Post('avatar')
    @UseInterceptors(
        FileInterceptor('avatar', {
            storage: memoryStorage(),
            limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        })
    )
    async uploadAvatar(
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser('sub') userId: number,
    ) {
        if (!file) throw new BadRequestException('No file provided');
        const { url } = await this.uploadService.uploadAvatar(file, userId);
        await this.usersService.updateAvatar(userId, url);
        return { avatarUrl: url };
    }
}