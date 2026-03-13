import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser }  from '../auth/decorators/current-user.decorator.js';
import { PushService }  from './push.service.js';

class SubscribeDto {
    endpoint: string;
    keys: { p256dh: string; auth: string };
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