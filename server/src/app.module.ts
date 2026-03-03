import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from "./chat/chat.module.js";
import {UsersModule} from "./users/users.module.js";


@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule,
        ChatModule,
        UsersModule
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}