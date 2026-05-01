import {forwardRef, Module} from '@nestjs/common';
import { ChatGateway }         from './chat.gateway.js';
import { SyncSessionService }  from './sync-session.service.js';
import { JwtModule }           from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule }        from '../prisma/prisma.module.js';
import { PushModule }          from '../push/push.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { FriendsModule }       from '../friends/friends.module.js';

@Module({
    imports: [
        forwardRef(() => ConversationsModule),
        PrismaModule,
        ConversationsModule,
        FriendsModule,
        PushModule,
        JwtModule.registerAsync({
            imports:    [ConfigModule],
            inject:     [ConfigService],
            useFactory: (cfg: ConfigService) => ({ secret: cfg.get('JWT_SECRET') }),
        }),
    ],
    providers:   [ChatGateway, SyncSessionService],
    exports: [ChatGateway]
})
export class ChatModule {}