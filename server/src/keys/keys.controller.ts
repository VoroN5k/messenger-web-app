import {Body, Controller, Get, Header, Param, ParseIntPipe, Post, UseGuards} from "@nestjs/common";
import {JwtAuthGuard} from "../auth/guards/jwt-auth.guard.js";
import {KeysService} from "./keys.service.js";
import {CurrentUser} from "../auth/decorators/current-user.decorator.js";
import {PublishKeyDto} from "./dto/PublishKey.dto.js";

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
}

