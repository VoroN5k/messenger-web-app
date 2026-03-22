import {BadRequestException, Controller, Get, Query, UseGuards} from "@nestjs/common";
import {JwtAuthGuard} from "../auth/guards/jwt-auth.guard.js";
import {UploadService} from "../upload/upload.service.js";
import {Throttle} from "@nestjs/throttler";

const SAFE_PATH_RE = /^[\w\-./]+$/;

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
    constructor(private readonly upload: UploadService) {}

    @Throttle({ default: { ttl: 60_000, limit: 120 } })
    @Get('signed')
    async getSigned(@Query('path') rawPath: string) {
        if (!rawPath?.trim()) throw new BadRequestException('Path is required')

        const path = rawPath.trim().replace(/^\/+/, '').replace(/\.\./g, ''); // Remove leading slashes

        if(!path || !SAFE_PATH_RE.test(path)) {
            throw new BadRequestException('Invalid path format');
        }

        const { url, expiresAt } = await this.upload.getSignedUrl(path, 3_600);
        return { url, expiresAt };
    }
}