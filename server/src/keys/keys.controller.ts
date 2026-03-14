import {Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards} from "@nestjs/common";
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
    getKey(@Param('userId', ParseIntPipe) targetId: number) {
        return this.keysService.getKey(targetId);
    }
}

