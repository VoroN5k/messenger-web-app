import {
    BadRequestException, ConflictException,
    ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const USER_SELECT = {
    id: true, nickname: true, avatarUrl: true, isOnline: true, lastSeen: true,
};

@Injectable()
export class FriendsService {
    constructor(private readonly prisma: PrismaService) {}

    async sendRequest(senderId: number, receiverId: number) {
        if (senderId === receiverId)
            throw new BadRequestException('Cannot send request to yourself');

        const receiver = await this.prisma.user.findUnique({ where: { id: receiverId } });
        if (!receiver) throw new NotFoundException('User not found');

        const existing = await this.prisma.friendship.findFirst({
            where: {
                OR: [
                    { senderId, receiverId },
                    { senderId: receiverId, receiverId: senderId },
                ],
            },
        });

        if (existing) {
            if (existing.status === 'ACCEPTED')  throw new ConflictException('Already friends');
            if (existing.status === 'PENDING')   throw new ConflictException('Request already pending');
            if (existing.status === 'BLOCKED')   throw new ForbiddenException('Cannot send request');
            if (existing.status === 'DECLINED')  await this.prisma.friendship.delete({ where: { id: existing.id } });
        }

        return this.prisma.friendship.create({
            data: { senderId, receiverId, status: 'PENDING' },
            include: {
                sender:   { select: USER_SELECT },
                receiver: { select: USER_SELECT },
            },
        });
    }

    async respond(userId: number, friendshipId: number, action: 'ACCEPTED' | 'DECLINED') {
        const f = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
        if (!f)                       throw new NotFoundException('Request not found');
        if (f.receiverId !== userId)  throw new ForbiddenException('Not your request');
        if (f.status !== 'PENDING')   throw new BadRequestException('Already responded');

        return this.prisma.friendship.update({
            where: { id: friendshipId },
            data:  { status: action },
            include: {
                sender:   { select: USER_SELECT },
                receiver: { select: USER_SELECT },
            },
        });
    }

    async cancelRequest(userId: number, friendshipId: number) {
        const f = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
        if (!f)                     throw new NotFoundException('Request not found');
        if (f.senderId !== userId)  throw new ForbiddenException('Not your request');
        if (f.status !== 'PENDING') throw new BadRequestException('Already responded');
        await this.prisma.friendship.delete({ where: { id: friendshipId } });
        return { message: 'Cancelled' };
    }

    async removeFriend(userId: number, friendId: number) {
        const f = await this.prisma.friendship.findFirst({
            where: {
                status: 'ACCEPTED',
                OR: [
                    { senderId: userId, receiverId: friendId },
                    { senderId: friendId, receiverId: userId },
                ],
            },
        });
        if (!f) throw new NotFoundException('Friendship not found');
        await this.prisma.friendship.delete({ where: { id: f.id } });
        return { message: 'Removed' };
    }

    async getMyFriends(userId: number) {
        const list = await this.prisma.friendship.findMany({
            where: { status: 'ACCEPTED', OR: [{ senderId: userId }, { receiverId: userId }] },
            include: {
                sender:   { select: USER_SELECT },
                receiver: { select: USER_SELECT },
            },
        });
        return list.map((f) => ({
            friendshipId: f.id,
            friend: f.senderId === userId ? f.receiver : f.sender,
        }));
    }

    async getPendingRequests(userId: number) {
        return this.prisma.friendship.findMany({
            where: { receiverId: userId, status: 'PENDING' },
            include: { sender: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getSentRequests(userId: number) {
        return this.prisma.friendship.findMany({
            where: { senderId: userId, status: 'PENDING' },
            include: { receiver: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async searchUsers(currentUserId: number, query: string) {
        if (query.trim().length < 2) return [];

        const users = await this.prisma.user.findMany({
            where: {
                id: { not: currentUserId },
                isEmailVerified: true,
                OR: [
                    { nickname: { contains: query.trim(), mode: 'insensitive' } },
                    { email:    { contains: query.trim(), mode: 'insensitive' } },
                ],
            },
            select: { id: true, nickname: true, avatarUrl: true, isOnline: true },
            take: 20,
        });

        const friendships = await this.prisma.friendship.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: { in: users.map((u) => u.id) } },
                    { receiverId: currentUserId, senderId: { in: users.map((u) => u.id) } },
                ],
            },
        });

        return users.map((u) => {
            const f = friendships.find((f) => f.senderId === u.id || f.receiverId === u.id);
            return {
                ...u,
                friendshipId:     f?.id             ?? null,
                friendshipStatus: f?.status         ?? null,
                isRequester:      f?.senderId === currentUserId,
            };
        });
    }

    async areFriends(a: number, b: number) {
        const f = await this.prisma.friendship.findFirst({
            where: {
                status: 'ACCEPTED',
                OR: [{ senderId: a, receiverId: b }, { senderId: b, receiverId: a }],
            },
        });
        return !!f;
    }
}