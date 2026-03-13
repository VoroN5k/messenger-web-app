import {BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors} from "@nestjs/common";
import {JwtAuthGuard} from "../auth/guards/jwt-auth.guard.js";
import {UploadService} from "./upload.service.js";
import {FileInterceptor} from "@nestjs/platform-express";
import {memoryStorage} from "multer";
import {CurrentUser} from "../auth/decorators/current-user.decorator.js";

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
    constructor(private readonly uploadService: UploadService) {}

    @Post()
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        }),
    )
    async upload(
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser('sub') userId: number,
    ) {
        if (!file) throw new BadRequestException('No file provided');
        return this.uploadService.uploadFile(file,userId);
    }
}