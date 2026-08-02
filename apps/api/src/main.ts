import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logger/json-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  // CSP is meant to constrain what a *browser-rendered page* can load --
  // this is a JSON API with no page of its own except the Swagger UI it
  // serves for docs, which needs inline scripts helmet's default CSP would
  // block. The other headers (nosniff, frame-options, HSTS...) still apply.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const corsOriginEnv = configService.get<string>('CORS_ORIGIN');
  if (isProduction && !corsOriginEnv) {
    // Refuse to silently fall back to the localhost dev default in
    // production -- combined with `credentials: true` below, a wrong CORS
    // origin is a cookie-theft vector, so an unset value must fail loudly
    // rather than default to something that merely "happens to work".
    throw new Error('CORS_ORIGIN must be set explicitly in production.');
  }
  const corsOrigins = (corsOriginEnv ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Arena Pulse API')
    .setDescription('API REST du backend Arena Pulse')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);
}
void bootstrap();
