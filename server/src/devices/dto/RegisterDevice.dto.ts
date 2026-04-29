import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
    @IsString()
    bundle: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    deviceName?: string;
}
