import {
    IsArray, IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength,
} from 'class-validator';

export class CreateDirectDto {
    @IsInt() @IsPositive()
    targetUserId: number;
}

export class CreateGroupDto {
    @IsString() @MinLength(2) @MaxLength(50)
    name: string;

    @IsOptional() @IsString() @MaxLength(200)
    description?: string;

    @IsArray() @IsInt({ each: true })
    memberIds: number[];
}

export class CreateChannelDto {
    @IsString() @MinLength(2) @MaxLength(50)
    name: string;

    @IsOptional() @IsString() @MaxLength(200)
    description?: string;
}

export class UpdateConversationDto {
    @IsOptional() @IsString() @MaxLength(50)
    name?: string;

    @IsOptional() @IsString() @MaxLength(200)
    description?: string;

    @IsOptional() @IsString()
    avatarUrl?: string;
}

export class AddMemberDto {
    @IsInt() @IsPositive()
    userId: number;
}