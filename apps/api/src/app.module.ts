import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { MailModule } from './mail/mail.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { SportsModule } from './sports/sports.module';
import { TournamentsModule } from './tournaments/tournaments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
    MailModule,
    OrganizationsModule,
    SportsModule,
    PermissionsModule,
    TournamentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
