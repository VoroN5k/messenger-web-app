import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import * as dotenv from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  dotenv.config();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');
  app.use(cookieParser());

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = ['http://localhost:3000', process.env.CLIENT_URL].filter(
        Boolean,
      );
      if (!origin || allowed.includes(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  await app.listen(process.env.PORT || 4000);

  if (process.env.NODE_ENV !== 'production') {
    const SELF_URL = process.env.SELF_URL ?? 'http://localhost:4000';
    setInterval(() => {
      fetch(`${SELF_URL}/api/health`).catch(() => {});
    }, 4 * 60 * 1000);
  }

  console.log(`Server running on http://localhost:${process.env.PORT || 4000}`);
}

await bootstrap();
