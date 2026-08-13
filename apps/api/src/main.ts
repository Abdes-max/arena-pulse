import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logger/json-logger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new JsonLogger(),
    // Needed for Stripe webhook signature verification (payments/webhook
    // uses req.rawBody) -- Nest still populates the parsed req.body for
    // every other route as usual.
    rawBody: true,
  });
  const configService = app.get(ConfigService);

  // Team logos (feat/045) -- local-disk upload served back out under
  // /uploads, outside the /api/v1 prefix set below since it's a static
  // asset, not an API route. UPLOADS_DIR must match TeamsService's own
  // resolution of the same env var (default ./uploads, relative to the
  // process cwd) -- see docker-compose.prod.yml for the persistent volume
  // mounted there in production.
  app.useStaticAssets(
    resolve(configService.get<string>('UPLOADS_DIR', './uploads')),
    {
      prefix: '/uploads',
    },
  );

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
    .setTitle('TournArena API')
    .setDescription('API REST du backend TournArena')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);
}
void bootstrap();
