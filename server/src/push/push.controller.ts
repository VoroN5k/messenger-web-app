import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser }  from '../auth/decorators/current-user.decorator.js';
import { PushService }  from './push.service.js';
import { IsString, IsNotEmpty, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

// 1. Описуємо вкладений об'єкт ключів
class PushKeysDto {
    @IsString()
    @IsNotEmpty()
    p256dh: string;

    @IsString()
    @IsNotEmpty()
    auth: string;
}

// 2. Описуємо головний DTO
export class SubscribeDto {
    @IsString()
    @IsNotEmpty()
    endpoint: string;

    @IsObject()
    @ValidateNested()
    @Type(() => PushKeysDto)
    keys: PushKeysDto;
}

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
    constructor(private readonly pushService: PushService) {}

    @Post('subscribe')
    subscribe(
        @CurrentUser('sub') userId: number,
        @Body() dto: SubscribeDto,
    ) {
        return this.pushService.subscribe(userId, dto);
    }

    @Delete('unsubscribe')
    unsubscribe(
        @CurrentUser('sub') userId: number,
        @Body('endpoint') endpoint: string,
    ) {
        return this.pushService.unsubscribe(userId, endpoint);
    }
}