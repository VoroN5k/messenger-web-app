import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import * as dotenv from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {

    dotenv.config();



    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }));

    app.setGlobalPrefix('api');
    app.use(cookieParser());

    app.enableCors({
        origin: ['http://localhost:3000'],
        credentials: true,
    });

    await app.listen(process.env.PORT || 4000);
    console.log(`Server running on http://localhost:${process.env.PORT || 4000}`);
}

bootstrap();