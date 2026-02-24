import { Module } from '@nestjs/common';


@Module({
    imports: [PrismaModule, AuthModule],
    controllers: [],
    providers: [],
})
export class AppModule {}