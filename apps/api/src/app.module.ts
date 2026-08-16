import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ContactModule } from './contact/contact.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PlayerAuthModule } from './player-auth/player-auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { SportsModule } from './sports/sports.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { SuperAdminAuthModule } from './super-admin-auth/super-admin-auth.module';
import { TournamentsModule } from './tournaments/tournaments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // e2e tests (NODE_ENV=test, set automatically under Jest -- see the
      // ThrottlerModule comment below) get their own database, so running
      // them locally never touches the same Postgres `npm run dev:api` /
      // manually-seeded data uses (apps/api/.env.test only overrides
      // DATABASE_URL; dotenv never overrides an already-set process.env
      // key, so every other variable still comes from the regular .env
      // loaded right after). Harmless for CI, which already sets
      // DATABASE_URL as a real environment variable before Node even starts
      // (.github/workflows/ci.yml) -- dotenv can't override that either
      // way, and apps/api/.env.test isn't committed (gitignored, like .env
      // itself), so this array is a same-directory no-op there regardless.
      envFilePath:
        process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : '.env',
    }),
    // Global default; auth.controller.ts's login/register/refresh endpoints
    // override this with a stricter limit (brute-force/credential-stuffing
    // protection matters far more there than on ordinary read endpoints).
    // Effectively unlimited under Jest (NODE_ENV=test, set automatically) --
    // the e2e suite logs in dozens of times across 17 spec files, which a
    // production-appropriate limit would otherwise throttle mid-run.
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 100_000 : 100 },
    ]),
    PrismaModule,
    AuthModule,
    PlayerAuthModule,
    SuperAdminAuthModule,
    SuperAdminModule,
    MailModule,
    ContactModule,
    OrganizationsModule,
    SportsModule,
    PermissionsModule,
    TournamentsModule,
    RegistrationsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
