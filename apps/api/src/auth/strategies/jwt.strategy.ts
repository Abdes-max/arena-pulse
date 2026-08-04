import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../token.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    // Same JWT_SECRET signs PlayerAccount tokens too (player-auth/token-payload.ts)
    // -- reject one presented where an organizer token is expected.
    if (payload.type !== 'organizer') {
      throw new UnauthorizedException('Session invalide.');
    }
    return { id: payload.sub, email: payload.email };
  }
}
