import {IsString, Length} from "class-validator";

export class PublishKeyDto {
    @IsString() @Length(43 ,44)
    publicKey: string;
}