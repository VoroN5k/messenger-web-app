import {Body, Controller, Get, Header, Param, ParseIntPipe, Post, UseGuards} from "@nestjs/common";
import {JwtAuthGuard} from "../auth/guards/jwt-auth.guard.js";
import {KeysService} from "./keys.service.js";
import {CurrentUser} from "../auth/decorators/current-user.decorator.js";
import {PublishKeyDto} from "./dto/PublishKey.dto.js";
import {SaveRecoveryKeyDto} from "./dto/SaveRecoveryKey.dto.js";
import {PublishBundleV2Dto} from "./dto/PublishBundleV2.dto.js";
import {SaveRecoveryV2Dto} from "./dto/SaveRecoveryV2.dto.js";

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

    // ── V2 key bundle (X3DH) ────────────────────────────────────────────────

    @Post('v2')
    publishBundleV2(
        @CurrentUser('sub') userId: number,
        @Body() dto: PublishBundleV2Dto,
    ) {
        return this.keysService.publishBundleV2(userId, dto.bundle);
    }

    // Static route must be declared before the parameterised one below
    @Get('v2/recovery')
    @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
    @Header('Pragma', 'no-cache')
    getRecoveryV2(@CurrentUser('sub') userId: number) {
        return this.keysService.getRecoveryV2(userId);
    }

    @Get('v2/:userId')
    @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
    @Header('Pragma', 'no-cache')
    getBundleV2(@Param('userId', ParseIntPipe) targetId: number) {
        return this.keysService.getBundleV2(targetId);
    }

    @Post('v2/recovery')
    saveRecoveryV2(
        @CurrentUser('sub') userId: number,
        @Body() dto: SaveRecoveryV2Dto,
    ) {
        return this.keysService.saveRecoveryV2(
            userId,
            dto.encryptedBlob,
            dto.isReset ?? false,
            dto.twoFactorCode,
        );
    }
}

