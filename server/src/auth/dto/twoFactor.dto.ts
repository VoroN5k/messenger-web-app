import {IsString, Length} from "class-validator";

export class Enable2FADto {
    @IsString() @Length(6, 6)
    token: string;
}

export class Disable2FADto {
    @IsString() @Length(6, 6)
    token: string;

    @IsString()
    password: string;
}