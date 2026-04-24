import {
  IsEnum, IsOptional, IsString,
  MaxLength, MinLength,
} from 'class-validator';
import { ReportStatus, ReportType } from '../../../generated/prisma/client.js';

export class CreateReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsString() @MinLength(5) @MaxLength(200)
  title: string;

  @IsString() @MinLength(10) @MaxLength(2000)
  description: string;

  @IsOptional()
  metadata?: {
    page?: string;
    userAgent?: string;
  };
}

export class UpdateReportDto {
  @IsOptional() @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional() @IsString() @MaxLength(1000)
  adminNote?: string;
}

export class ReportQueryDto {
  @IsOptional() @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional() @IsEnum(ReportType)
  type?: ReportType;

  @IsOptional() @IsString()
  page?: string;

  @IsOptional() @IsString()
  take?: string;
}