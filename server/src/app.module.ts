import { Module }        from '@nestjs/common';
import { ConfigModule }  from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule }    from './auth/auth.module.js';
import { ChatModule }    from './chat/chat.module.js';
import { UsersModule }   from './users/users.module.js';
import { UploadModule }  from './upload/upload.module.js';
import { PushModule }    from './push/push.module.js';
import {FriendsModule} from "./friends/friends.module.js";
import {ConversationsModule} from "./conversations/conversations.module.js";

@Module({
    imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule,
        ChatModule,
        UsersModule,
        UploadModule,
        PushModule,
        FriendsModule,
        ConversationsModule,
    ],
})
export class AppModule {}