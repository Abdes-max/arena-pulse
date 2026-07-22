import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { parseDurationToSeconds, TokenService } from './token.service';

describe('parseDurationToSeconds', () => {
  it('parses seconds/minutes/hours/days', () => {
    expect(parseDurationToSeconds('3600s')).toBe(3600);
    expect(parseDurationToSeconds('5m')).toBe(300);
    expect(parseDurationToSeconds('2h')).toBe(7200);
    expect(parseDurationToSeconds('30d')).toBe(30 * 86400);
  });

  it('throws on an invalid format', () => {
    expect(() => parseDurationToSeconds('30 days')).toThrow();
  });
});

describe('TokenService', () => {
  function createService(env: Record<string, string> = {}) {
    const jwtService = new JwtService({ secret: 'test-secret' });
    const configService = new ConfigService(env);
    return new TokenService(jwtService, configService);
  }

  it('signs an access token carrying sub/email and honours JWT_EXPIRES_IN', () => {
    const service = createService({ JWT_EXPIRES_IN: '60s' });
    const token = service.signAccessToken({
      sub: 'user-1',
      email: 'a@example.com',
    });
    const decoded = new JwtService({ secret: 'test-secret' }).verify<{
      sub: string;
      email: string;
    }>(token);
    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('a@example.com');
    expect(service.accessTokenExpiresInSeconds).toBe(60);
  });

  it('issues unique, hashed refresh tokens with the configured TTL', () => {
    const service = createService({ JWT_REFRESH_EXPIRES_IN: '1d' });
    const first = service.issueRefreshToken();
    const second = service.issueRefreshToken();

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(service.hashRefreshToken(first.token));
    expect(first.tokenHash).not.toBe(first.token);
    expect(first.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
