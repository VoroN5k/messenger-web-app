import { Module }       from '@nestjs/common';
import { ChatGateway }  from './chat.gateway.js';
import { JwtModule }    from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService }  from './chat.service.js';
import { PushModule }   from '../push/push.module.js';
import {ConversationsModule} from "../conversations/conversations.module.js";
import {FriendsModule} from "../friends/friends.module.js";  // ← додати

@Module({
    imports: [
        PrismaModule,
        ConversationsModule,
        FriendsModule,
        PushModule,   // ← додати
        JwtModule.registerAsync({
            imports:    [ConfigModule],
            inject:     [ConfigService],
            useFactory: (cfg: ConfigService) => ({secret: cfg.get('JWT_SECRET'),
            }),
        }),
    ],
    controllers: [ChatController],
    providers:   [ChatGateway],
})
export class ChatModule {}