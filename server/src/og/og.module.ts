import {Module} from "@nestjs/common";
import {OGController} from "./og.controller.js";
import {OgService} from "./og.service.js";

@Module({
    controllers: [OGController],
    providers: [OgService]
})
export class OGModule {}