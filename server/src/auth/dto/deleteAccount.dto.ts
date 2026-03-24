import {IsOptional, IsString, Length, MinLength} from "class-validator";

export class DeleteAccountDto {
    @IsString()
    @MinLength(1)
    password: string;

    @IsOptional()
    @IsString() @Length(6, 6)
    twoFactorCode?: string;
}