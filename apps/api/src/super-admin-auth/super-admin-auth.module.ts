import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module';
import { SuperAdminJwtAuthGuard } from './guards/super-admin-jwt-auth.guard';
import { SuperAdminAuthController } from './super-admin-auth.controller';
import { SuperAdminAuthService } from './super-admin-auth.service';
import { SuperAdminJwtStrategy } from './strategies/super-admin-jwt.strategy';

@Module({
  // AuthModule already exports TokenService/PasswordService (JWT signing,
  // refresh-token hashing, argon2) -- both are payload/subject-agnostic, so
  // this module reuses them rather than duplicating that logic (same
  // rationale as PlayerAuthModule).
  imports: [AuthModule, PassportModule],
  controllers: [SuperAdminAuthController],
  providers: [
    SuperAdminAuthService,
    SuperAdminJwtStrategy,
    SuperAdminJwtAuthGuard,
  ],
  exports: [SuperAdminAuthService, SuperAdminJwtAuthGuard],
})
export class SuperAdminAuthModule {}
