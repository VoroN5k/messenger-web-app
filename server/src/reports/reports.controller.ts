import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReportsService } from './reports.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  CreateReportDto,
  ReportQueryDto,
  UpdateReportDto,
} from './dto/reports.dto.js';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma:  PrismaService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post()
  create(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateReportDto,
  ) {
    return this.reports.create(userId, dto);
  }

  // Admin-only: get all reports
  @Get()
  async findAll(
    @CurrentUser('sub') userId: number,
    @Query() query: ReportQueryDto,
  ) {
    await this.assertAdmin(userId);
    return this.reports.findAll(query);
  }

  // Admin-only: update status / add note
  @Patch(':id')
  async update(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReportDto,
  ) {
    await this.assertAdmin(userId);
    return this.reports.update(userId, id, dto);
  }

  private async assertAdmin(userId: number) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { role: true },
    });
    if (user?.role !== 'ADMIN') throw new ForbiddenException('Admin only');
  }
}