import {IsEnum, IsInt, IsPositive} from "class-validator";

export class SendFriendRequestDto {
    @IsInt() @IsPositive()
    receiverId: number;
}

export class RespondFriendRequestDto {
    @IsInt() @IsPositive()
    friendshipId: number;

    @IsEnum(['ACCEPTED', 'DECLINED'])
    action: 'ACCEPTED' | 'DECLINED';
}