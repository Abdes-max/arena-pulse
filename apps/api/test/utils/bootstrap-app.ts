import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

/**
 * Mirrors the production bootstrap in src/main.ts (global prefix, cookie
 * parsing, validation pipe) so e2e tests exercise the app the same way a
 * real request would, without duplicating that setup in every spec file.
 * `configureModule` lets a spec override providers (e.g. stub MailService)
 * before the module is compiled.
 */
export async function createTestApp(
  configureModule?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configureModule) {
    builder = configureModule(builder);
  }
  const moduleFixture = await builder.compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>({
    rawBody: true,
  });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  return app;
}
