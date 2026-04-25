import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadService } from '../upload/upload.service.js';

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private readonly GRACE_MS = 60 * 60 * 1_000; // 1 hour
  private readonly INTERVAL_MS = 10 * 60 * 1_000; // 10 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
  ) {}

  onModuleInit() {
    // Run once on startup (with a small delay so DB connection is ready) then on interval.
    setTimeout(() => this.runCleanup(), 15_000);
    this.intervalId = setInterval(() => this.runCleanup(), this.INTERVAL_MS);
    this.logger.log(
      `Cleanup service started — grace period ${this.GRACE_MS / 60_000}m, ` +
      `interval ${this.INTERVAL_MS / 60_000}m`,
    );
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  async runCleanup(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - this.GRACE_MS);

      // 1. Find messages to hard-delete (soft-deleted past grace period)
      const messages = await this.prisma.message.findMany({
        where: { deletedAt: { lte: cutoff } },
        select: { id: true, fileUrl: true },
        take: 1_000, // process in batches
      });

      if (!messages.length) return;

      const ids     = messages.map(m => m.id);
      const fileUrls = messages
        .map(m => m.fileUrl)
        .filter((url): url is string => !!url);

      // 2. Hard-delete from DB
      await this.prisma.$transaction([
        // Remove reactions, pinned references first
        this.prisma.reaction.deleteMany({ where: { messageId: { in: ids } } }),
        this.prisma.pinnedMessage.deleteMany({ where: { messageId: { in: ids } } }),
        this.prisma.message.deleteMany({ where: { id: { in: ids } } }),
      ]);

      // 3. Delete orphaned files from storage (fire-and-forget, non-critical)
      for (const url of fileUrls) {
        // Only delete if no other non-deleted message references it
        const otherRefs = await this.prisma.message.count({
          where: { fileUrl: url },
        });
        if (otherRefs === 0) {
          this.upload.deleteFile(url).catch(() => {});
        }
      }

      this.logger.log(`Cleanup: hard-deleted ${messages.length} messages`);
    } catch (err: any) {
      this.logger.error(`Cleanup job failed: ${err.message}`);
    }
  }
}