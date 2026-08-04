import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PlayerAccessTokenPayload } from '../token-payload';

export interface AuthenticatedPlayer {
  id: string;
  email: string;
}

// Named 'player-jwt' (not the default 'jwt', already taken by the
// organizer JwtStrategy) -- registered locally via PlayerJwtAuthGuard on
// player-facing routes only, never globally (the global APP_GUARD stays
// organizer-only JwtAuthGuard; player routes opt out of it with @Public()
// and opt into this one instead).
@Injectable()
export class PlayerJwtStrategy extends PassportStrategy(
  Strategy,
  'player-jwt',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: PlayerAccessTokenPayload): AuthenticatedPlayer {
    if (payload.type !== 'player') {
      throw new UnauthorizedException('Session invalide.');
    }
    return { id: payload.sub, email: payload.email };
  }
}
