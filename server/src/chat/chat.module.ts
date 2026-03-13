import { Module }       from '@nestjs/common';
import { ChatGateway }  from './chat.gateway.js';
import { JwtModule }    from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService }  from './chat.service.js';
import { PushModule }   from '../push/push.module.js';  // ← додати

@Module({
    imports: [
        PrismaModule,
        PushModule,   // ← додати
        JwtModule.registerAsync({
            imports:    [ConfigModule],
            inject:     [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get('JWT_SECRET'),
                signOptions: { expiresIn: '7d' },
            }),
        }),
    ],
    controllers: [ChatController],
    providers:   [ChatGateway, ChatService],
})
export class ChatModule {}