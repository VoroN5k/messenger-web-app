import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from "./chat/chat.module.js";
import {UsersModule} from "./users/users.module.js";
import { ThrottlerModule } from '@nestjs/throttler';
import {UploadModule} from "./upload/upload.module.js";
import {PushModule} from "./push/push.module.js";


@Module({
    imports: [
        ThrottlerModule.forRoot([{ttl: 60000, limit: 10}]),
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule,
        ChatModule,
        UsersModule,
        UploadModule,
        PushModule
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}