import {isEmail, IsString, MinLength, MaxLength, IsEmail} from "class-validator";

export class RegisterDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    @MaxLength(32)
    password: string;

    @IsString()
    @MinLength(3)
    @MaxLength(20)
    nickname: string;
}