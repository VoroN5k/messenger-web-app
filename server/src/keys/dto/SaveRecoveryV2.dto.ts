import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class SaveRecoveryV2Dto {
    // Argon2id params are embedded inside the encrypted blob — no separate salt field
    @IsString() @IsNotEmpty()
    encryptedBlob: string;

    @IsOptional() @IsBoolean()
    isReset?: boolean;

    @IsOptional() @IsString() @Length(6, 6)
    twoFactorCode?: string;
}
