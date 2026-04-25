import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../auth/email/email.service.js';
import { UploadService } from '../upload/upload.service.js';
import {
  CreateReportDto,
  ReportQueryDto,
  UpdateReportDto,
} from './dto/reports.dto.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly email:   EmailService,
    private readonly upload:  UploadService,
  ) {}

  async create(userId: number, dto: CreateReportDto) {
    const report = await this.prisma.report.create({
      data: {
        userId,
        type:        dto.type,
        title:       dto.title,
        description: dto.description,
        metadata:    dto.metadata ?? {},
      },
      include: { user: { select: { nickname: true, email: true } } },
    });

    // Notify admins via email
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      this.email.sendAdminReportNotification(adminEmail, {
        id:       report.id,
        type:     report.type,
        title:    report.title,
        nickname: report.user.nickname,
        email:    report.user.email,
        page:     (report.metadata as any)?.page ?? '—',
      })
        .catch(() => {});
    }

    return { id: report.id, message: 'Report Submitted. Thank you!' };
  }

  async findAll(query: ReportQueryDto) {
    const take = Math.min(Number.parseInt(query.take ?? '50', 10), 100);
    const page = Math.max(Number.parseInt(query.page ?? '1', 10), 1);
    const skip = (page - 1) * take;

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type   ? { type:   query.type   } : {}),
    };

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          user: {
            select: { id: true, nickname: true, email: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.report.count({ where }),
    ]);

    return { reports, total, page, take };
  }

  async update(adminId: number, reportId: number, dto: UpdateReportDto) {
    const existing = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!existing) throw new NotFoundException('Report not found');

    // When closing a report that has an attached image, delete the image from storage
    if (dto.status === 'CLOSED' && existing.metadata) {
      const meta = existing.metadata as Record<string, unknown>;
      const imageUrl = meta['imageUrl'];
      if (typeof imageUrl === 'string') {
        this.upload.deleteFile(imageUrl).catch(() => {});
      }
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data:  {
        ...(dto.status    ? { status:    dto.status    } : {}),
        ...(dto.adminNote !== undefined ? { adminNote: dto.adminNote } : {}),
      },
    });
  }
}