import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from "./chat/chat.module.js";


@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule,
        ChatModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}