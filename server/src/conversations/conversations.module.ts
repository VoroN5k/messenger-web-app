import {forwardRef, Module} from '@nestjs/common';
import { ConversationsService }     from './conversations.service.js';
import { ConversationsController }  from './conversations.controller.js';
import {UploadModule} from "../upload/upload.module.js";
import {ChatModule} from "../chat/chat.module.js";
import { CleanupService } from './cleanup.service.js';

@Module({
    imports: [UploadModule, forwardRef(() => ChatModule)],
    controllers: [ConversationsController],
    providers:   [ConversationsService, CleanupService],
    exports:     [ConversationsService],
})
export class ConversationsModule {}