
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) {}

    async findAll(currentUserId: number) {
        return this.prisma.user.findMany({
            where: {
                id: {
                    not: currentUserId,
                },
            },
            select: {
                id: true,
                nickname: true,
                email: true,
                isOnline: true,
                lastSeen: true,
            },
            orderBy: {
                isOnline: 'desc',
            },
        });
    }


    async findOne(id: number) {
        return this.prisma.user.findUnique({
            where: { id },
            select: { id: true, nickname: true, isOnline: true },
        });
    }
}