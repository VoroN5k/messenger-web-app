import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { verifyKeyBundle } from '../common/verify-bundle.js';

const MAX_DEVICES = 5;

@Injectable()
export class DevicesService {
    constructor(private readonly prisma: PrismaService) {}

    async register(userId: number, bundle: string, deviceName?: string): Promise<{ deviceId: number }> {
        verifyKeyBundle(bundle);

        // Idempotent: same bundle for same user → return existing device
        const existing = await this.prisma.device.findFirst({
            where: { userId, bundle },
            select: { id: true },
        });
        if (existing) {
            await this.prisma.device.update({
                where: { id: existing.id },
                data: { lastSeenAt: new Date() },
            });
            return { deviceId: existing.id };
        }

        const count = await this.prisma.device.count({ where: { userId } });
        if (count >= MAX_DEVICES) {
            throw new BadRequestException(`Maximum ${MAX_DEVICES} devices per account`);
        }

        const device = await this.prisma.device.create({
            data: { userId, bundle, deviceName },
            select: { id: true },
        });
        return { deviceId: device.id };
    }

    async listMine(userId: number) {
        return this.prisma.device.findMany({
            where: { userId },
            select: { id: true, deviceName: true, createdAt: true, lastSeenAt: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    async remove(userId: number, deviceId: number): Promise<void> {
        const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
        if (!device) throw new NotFoundException('Device not found');
        if (device.userId !== userId) throw new BadRequestException('Not your device');
        await this.prisma.device.delete({ where: { id: deviceId } });
    }

    async touch(deviceId: number): Promise<void> {
        await this.prisma.device.updateMany({
            where: { id: deviceId },
            data: { lastSeenAt: new Date() },
        });
    }

    getBundle(deviceId: number) {
        return this.prisma.device.findUnique({
            where: { id: deviceId },
            select: { id: true, bundle: true },
        });
    }

    getUserBundles(userId: number) {
        return this.prisma.device.findMany({
            where: { userId },
            select: { id: true, bundle: true },
        });
    }
}
