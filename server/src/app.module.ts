import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';


@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}