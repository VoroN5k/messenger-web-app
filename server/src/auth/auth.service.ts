import {BadRequestException, ConflictException, Injectable, UnauthorizedException} from '@nestjs/common';
import {PrismaService} from "../prisma/prisma.service.js";
import {JwtService} from "@nestjs/jwt";
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) {}

    async register(email: string, password: string, confirmPassword: string, nickname: string) {
        if (password !== confirmPassword) throw new BadRequestException('Passwords do not match');

        const existingUser = await this.prisma.user.findFirst({
            where: {
                OR: [
                    {email},
                    {nickname}
                ]
            }
        });


        if (existingUser) throw new ConflictException('User already exists');

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await this.prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                nickname,
            },
        });

        const token = this.jwtService.sign({ userId: user.id });


        return {user, token};
    }

    async login(email: string, password: string) {
        const user = await this.prisma.user.findUnique({
            where: {email},
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload = {
            sub: user.id,
            email: user.email,
            nickname: user.nickname,
        };

        const token = this.jwtService.sign(payload);

        return {
            user: {
                id: user.id,
                email: user.email,
                nickname: user.nickname,
                createdAt: user.createdAt,
            },
            token,
        };
    }
}
