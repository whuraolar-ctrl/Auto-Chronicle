import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true, //converts query strings to numbers for pagination
  }));

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: config.get('FRONTEND_URL') || '*',
    credentials: true,
  });

  app.getHttpAdapter().getInstance().get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  await app.listen(config.get('PORT') ?? 4000);

  console.log(`Auto-Chronicle backend server is running on port ${config.get('PORT') ?? 4000}`);
}
bootstrap();
