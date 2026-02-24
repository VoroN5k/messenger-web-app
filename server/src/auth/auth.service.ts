import { Injectable } from '@nestjs/common';
import {PrismaService} from "../prisma/prisma.service";
import {JwtService} from "@nestjs/jwt";
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) {}

    async register(email: string, password: string, confirmPassword: string, nickname: string) {
        if (password !== confirmPassword) throw new Error('Passwords do not match');

        const existingUser = await this.prisma.user.findFirst({
            where: {
                OR: [
                    {email},
                    {nickname}
                ]
            }
        });

        if (existingUser) throw new Error('User already exists');

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await this.prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                nickname,
            },
        });

        const token = this.jwtService.sign({sub: user.id, email: user.email});

        return {user, token};
    }


}
