import {Body, Controller, Get, Header, Param, ParseIntPipe, Post, UseGuards} from "@nestjs/common";
import {JwtAuthGuard} from "../auth/guards/jwt-auth.guard.js";
import {KeysService} from "./keys.service.js";
import {CurrentUser} from "../auth/decorators/current-user.decorator.js";
import {PublishKeyDto} from "./dto/PublishKey.dto.js";
import {SaveRecoveryKeyDto} from "./dto/SaveRecoveryKey.dto.js";

@Controller('keys')
@UseGuards(JwtAuthGuard)
export class KeysController {
    constructor(private readonly keysService: KeysService) {}

    @Post()
    publish(@CurrentUser('sub') userId: number, @Body() dto: PublishKeyDto) {
        return this.keysService.publishKey(userId, dto.publicKey);
    }

    @Get(':userId')
    @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
    @Header('Pragma', 'no-cache')
    getKey(@Param('userId', ParseIntPipe) targetId: number) {
        return this.keysService.getKey(targetId);
    }

    @Post('recovery')
    saveRecovery(
        @CurrentUser('sub') userId: number,
        @Body() dto: SaveRecoveryKeyDto,
    ) {
        return this.keysService.saveRecoveryKey(
            userId,
            dto.encryptedBlob,
            dto.salt,
            dto.isReset ?? false,
            dto.twoFactorCode,
        );
    }

    @Get('recovery/me')
    getRecovery(@CurrentUser('sub') userId: number) {
        return this.keysService.getRecoveryKey(userId);
    }
}

