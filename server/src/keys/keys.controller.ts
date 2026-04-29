import {Body, Controller, Get, Header, NotFoundException, Param, ParseIntPipe, Post, UseGuards} from "@nestjs/common";
import {JwtAuthGuard} from "../auth/guards/jwt-auth.guard.js";
import {KeysService} from "./keys.service.js";
import {CurrentUser} from "../auth/decorators/current-user.decorator.js";
import {PublishKeyDto} from "./dto/PublishKey.dto.js";
import {SaveRecoveryKeyDto} from "./dto/SaveRecoveryKey.dto.js";
import {PublishBundleV2Dto} from "./dto/PublishBundleV2.dto.js";
import {SaveRecoveryV2Dto} from "./dto/SaveRecoveryV2.dto.js";
import {DevicesService} from "../devices/devices.service.js";

@Controller('keys')
@UseGuards(JwtAuthGuard)
export class KeysController {
    constructor(
        private readonly keysService: KeysService,
        private readonly devicesService: DevicesService,
    ) {}

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

    @Post('v2/notify-upgrade/:userId')
    notifyUpgrade(
        @CurrentUser('sub') requesterId: number,
        @Param('userId', ParseIntPipe) targetId: number,
    ) {
        return this.keysService.notifyUpgradeV2(requesterId, targetId);
    }

    // ── V3 device bundles ────────────────────────────────────────────────────

    // Static route must precede the parameterised one
    @Get('v3/device/:deviceId')
    @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
    async getDeviceBundle(@Param('deviceId', ParseIntPipe) deviceId: number) {
        const row = await this.devicesService.getBundle(deviceId);
        if (!row) throw new NotFoundException('Device bundle not found');
        return { deviceId: row.id, bundle: row.bundle };
    }

    @Get('v3/devices/:userId')
    @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
    getUserDeviceBundles(@Param('userId', ParseIntPipe) userId: number) {
        return this.devicesService.getUserBundles(userId);
    }
}

