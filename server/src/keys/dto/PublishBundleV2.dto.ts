import { IsString, Length } from 'class-validator';

export class PublishBundleV2Dto {
    // X3DH bundle: 161 bytes → base64url ≈ 215 chars (no padding)
    @IsString() @Length(200, 300)
    bundle: string;
}
