import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { EmailModule } from '../auth/email/email.module.js';
import { UploadModule } from '../upload/upload.module.js';

@Module({
  imports: [EmailModule, UploadModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}