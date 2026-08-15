import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SuperAdminAccessTokenPayload } from '../token-payload';

export interface AuthenticatedSuperAdmin {
  id: string;
  email: string;
}

// Named 'super-admin-jwt' (not the default 'jwt', already taken by the
// organizer JwtStrategy, nor 'player-jwt') -- registered locally via
// SuperAdminJwtAuthGuard on super-admin routes only, never globally (the
// global APP_GUARD stays organizer-only JwtAuthGuard; super-admin routes
// opt out of it with @Public() and opt into this one instead). Same
// three-way disambiguation pattern as organizer/player: all three token
// types share JWT_SECRET, so the `type` claim is the only thing keeping an
// organizer or player token from being accepted here, and vice versa.
@Injectable()
export class SuperAdminJwtStrategy extends PassportStrategy(
  Strategy,
  'super-admin-jwt',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: SuperAdminAccessTokenPayload): AuthenticatedSuperAdmin {
    if (payload.type !== 'super-admin') {
      throw new UnauthorizedException('Session invalide.');
    }
    return { id: payload.sub, email: payload.email };
  }
}
