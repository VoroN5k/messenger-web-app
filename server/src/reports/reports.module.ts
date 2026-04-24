import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { EmailModule } from '../auth/email/email.module.js';

@Module({
  imports: [EmailModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}