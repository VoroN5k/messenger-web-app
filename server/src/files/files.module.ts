import {Module} from "@nestjs/common";
import {UploadModule} from "../upload/upload.module.js";
import {FilesController} from "./files.controller.js";

@Module({
    imports: [UploadModule],
    controllers: [FilesController],
})
export class FilesModule {}