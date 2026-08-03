import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module';
import { PlayerJwtAuthGuard } from './guards/player-jwt-auth.guard';
import { PlayerAuthController } from './player-auth.controller';
import { PlayerAuthService } from './player-auth.service';
import { PlayerJwtStrategy } from './strategies/player-jwt.strategy';

@Module({
  // AuthModule already exports TokenService/PasswordService (JWT signing,
  // refresh-token hashing, argon2) -- both are payload/subject-agnostic, so
  // this module reuses them rather than duplicating that logic.
  imports: [AuthModule, PassportModule],
  controllers: [PlayerAuthController],
  providers: [PlayerAuthService, PlayerJwtStrategy, PlayerJwtAuthGuard],
  exports: [PlayerAuthService, PlayerJwtAuthGuard],
})
export class PlayerAuthModule {}
