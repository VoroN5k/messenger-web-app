import {IsString, MinLength, MaxLength, IsEmail, IsOptional, IsObject, IsBoolean} from "class-validator";

export class RegisterDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    @MaxLength(32)
    password: string;

    @IsString()
    @MinLength(6)
    @MaxLength(32)
    confirmPassword: string;

    @IsString()
    @MinLength(3)
    @MaxLength(20)
    nickname: string;

    @IsBoolean()
    tosAccepted: boolean;

    @IsOptional()
    @IsObject()
    meta?: {
        userAgent?: string;
        ip?: string;
    }
}