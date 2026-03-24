import {IsNotEmpty, IsString} from "class-validator";

export class SaveRecoveryKeyDto {
    @IsString() @IsNotEmpty() encryptedBlob: string;
    @IsString() @IsNotEmpty() salt: string;
}