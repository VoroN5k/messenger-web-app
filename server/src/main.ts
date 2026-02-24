import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

async function bootstrap() {

    dotenv.config();

    const app = await NestFactory.create(AppModule);


    app.setGlobalPrefix('api');


    app.enableCors({
        origin: ['http://localhost:3000'],
        credentials: true,
    });

    await app.listen(process.env.PORT || 4000);
    console.log(`Server running on http://localhost:${process.env.PORT || 4000}`);
}

bootstrap();