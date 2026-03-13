import { Injectable, Logger } from '@nestjs/common';
import { ConfigService }      from '@nestjs/config';
import { PrismaService }      from '../prisma/prisma.service.js';
import webpush           from 'web-push';

export interface PushPayload {
    title:    string;
    body:     string;
    senderId: number;
    url?:     string;
}

@Injectable()
export class PushService {
    private readonly logger = new Logger(PushService.name);

    constructor(
        private readonly prisma:  PrismaService,
        private readonly config:  ConfigService,
    ) {
        webpush.setVapidDetails(
            this.config.getOrThrow<string>('VAPID_EMAIL'),
            this.config.getOrThrow<string>('VAPID_PUBLIC_KEY'),
            this.config.getOrThrow<string>('VAPID_PRIVATE_KEY'),
        );
    }

    async subscribe(userId: number, dto: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
    }) {
        return this.prisma.pushSubscription.upsert({
            where:  { endpoint: dto.endpoint },
            create: { userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
            update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
        });
    }

    async unsubscribe(userId: number, endpoint: string) {
        await this.prisma.pushSubscription.deleteMany({
            where: { userId, endpoint },
        });
    }

    async sendToUser(userId: number, payload: PushPayload): Promise<void> {
        const subs = await this.prisma.pushSubscription.findMany({
            where: { userId },
        });

        if (!subs.length) return;

        const results = await Promise.allSettled(
            subs.map((sub) =>
                webpush
                    .sendNotification(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        JSON.stringify(payload),
                    )
                    .catch(async (err: any) => {
                        // 410 Gone — підписка більше не валідна, видаляємо
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            await this.prisma.pushSubscription
                                .delete({ where: { id: sub.id } })
                                .catch(() => {});
                        }
                        throw err;
                    }),
            ),
        );

        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed) {
            this.logger.warn(`Push: ${failed}/${subs.length} failed for user ${userId}`);
        }
    }
}