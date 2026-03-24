import {IsBoolean, IsNotEmpty, IsOptional, IsString, Length} from "class-validator";

export class SaveRecoveryKeyDto {
    @IsString() @IsNotEmpty() encryptedBlob: string;
    @IsString() @IsNotEmpty() salt: string;
    @IsOptional() @IsBoolean() isReset?: boolean;
    @IsOptional() @IsString() @Length(6, 6) twoFactorCode?: string;
}