import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from "./chat/chat.module.js";
import {UsersModule} from "./users/users.module.js";
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';


@Module({
    imports: [
        ThrottlerModule.forRoot([{
            ttl: 60000,
            limit: 10,
        }]),
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule,
        ChatModule,
        UsersModule
    ],
    controllers: [],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule {}