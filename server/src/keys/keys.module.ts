import {Module} from "@nestjs/common";
import {KeysController} from "./keys.controller.js";
import {KeysService} from "./keys.service.js";
import {EmailModule} from "../auth/email/email.module.js";
import {DevicesModule} from "../devices/devices.module.js";

@Module({
    imports: [EmailModule, DevicesModule],
    controllers: [KeysController],
    providers: [KeysService],
})

export class KeysModule {}