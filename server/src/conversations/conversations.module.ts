import { Module }                   from '@nestjs/common';
import { ConversationsService }     from './conversations.service.js';
import { ConversationsController }  from './conversations.controller.js';
import {UploadModule} from "../upload/upload.module.js";

@Module({
    imports: [UploadModule],
    controllers: [ConversationsController],
    providers:   [ConversationsService],
    exports:     [ConversationsService],
})
export class ConversationsModule {}