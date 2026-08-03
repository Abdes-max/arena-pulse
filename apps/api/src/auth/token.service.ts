import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

// `type` distinguishes an organizer access token from a PlayerAccount one
// (see player-auth/token-payload.ts) -- both are signed with the same
// JWT_SECRET, so without this claim a player token would pass
// JwtStrategy.validate and vice versa, resolving `sub` against the wrong
// table entirely.
export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'organizer';
}

export interface IssuedRefreshToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

const DURATION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/** Parses simple durations like "3600s"/"30d" (the format already used by JWT_EXPIRES_IN). */
export function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}" (expected e.g. "3600s" or "30d")`,
    );
  }
  return Number(match[1]) * DURATION_UNIT_SECONDS[match[2]];
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Generic over the payload shape so PlayerAuthService (a different `type`
  // claim, see AccessTokenPayload above) can reuse this same signer/rotation
  // logic instead of duplicating it.
  signAccessToken<T extends object>(payload: T): string {
    return this.jwtService.sign(payload, {
      expiresIn: this.accessTokenExpiresInSeconds,
    });
  }

  get accessTokenExpiresInSeconds(): number {
    return parseDurationToSeconds(
      this.configService.get<string>('JWT_EXPIRES_IN', '3600s'),
    );
  }

  issueRefreshToken(): IssuedRefreshToken {
    const token = randomBytes(64).toString('base64url');
    const expiresInSeconds = parseDurationToSeconds(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
    );
    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
