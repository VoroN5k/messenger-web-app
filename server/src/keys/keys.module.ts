import {Module} from "@nestjs/common";
import {KeysController} from "./keys.controller.js";
import {KeysService} from "./keys.service.js";

@Module({
    controllers: [KeysController],
    providers: [KeysService],
})

export class KeysModule {}