import {Module} from "@nestjs/common";
import {KeysController} from "./keys.controller.js";
import {KeysService} from "./keys.service.js";
import {EmailModule} from "../auth/email/email.module.js";

@Module({
    imports: [EmailModule],
    controllers: [KeysController],
    providers: [KeysService],
})

export class KeysModule {}