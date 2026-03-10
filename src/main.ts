import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function listenWithFallback(app: any, initialPort: number, maxAttempts = 10): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const portToTry = initialPort + attempt;
    try {
      await app.listen(portToTry);
      return portToTry;
    } catch (error: any) {
      if (error?.code === 'EADDRINUSE' && attempt < maxAttempts - 1) {
        console.warn(`Port ${portToTry} is already in use. Trying port ${portToTry + 1}...`);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Unable to bind server from port ${initialPort} after ${maxAttempts} attempts.`);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve uploaded files as static assets
  app.useStaticAssets(join(__dirname, '..', '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Urco API')
    .setDescription('The Urco API description')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const requestedPort = parsePort(process.env.PORT, 3000);
  const activePort = await listenWithFallback(app, requestedPort, 10);

  if (activePort !== requestedPort) {
    console.warn(`Requested port ${requestedPort} was unavailable. Application started on fallback port ${activePort}.`);
  }

  console.log(`Application is running on: http://localhost:${activePort}/api/v1`);
  console.log(`Swagger docs available at: http://localhost:${activePort}/api/docs`);
}

bootstrap();

