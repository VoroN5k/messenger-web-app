import {
    Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser }  from '../auth/decorators/current-user.decorator.js';
import { DevicesService } from './devices.service.js';
import { RegisterDeviceDto } from './dto/RegisterDevice.dto.js';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
    constructor(private readonly devicesService: DevicesService) {}

    @Post()
    register(
        @CurrentUser('sub') userId: number,
        @Body() dto: RegisterDeviceDto,
    ) {
        return this.devicesService.register(userId, dto.bundle, dto.deviceName);
    }

    @Get('me')
    listMine(@CurrentUser('sub') userId: number) {
        return this.devicesService.listMine(userId);
    }

    @Delete(':id')
    remove(
        @CurrentUser('sub') userId: number,
        @Param('id', ParseIntPipe) deviceId: number,
    ) {
        return this.devicesService.remove(userId, deviceId);
    }
}
