import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { MailLang } from '../mail/decorators/mail-lang.decorator';
import type { MailLanguage } from '../mail/mail-language';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const REFRESH_TOKEN_PATH = '/api/v1/auth';

// Well below the app-wide default (100/min, see app.module.ts) -- these are
// the credential-stuffing/brute-force-sensitive endpoints. Relaxed under
// Jest (NODE_ENV=test) for the same reason as app.module.ts's throttler
// config -- the e2e suite logs in far more than 5 times a minute.
const AUTH_THROTTLE = {
  default: {
    limit: process.env.NODE_ENV === 'test' ? 100_000 : 5,
    ttl: 60_000,
  },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body() dto: RegisterDto, @MailLang() lang: MailLanguage) {
    // No session issued here anymore -- the account isn't usable until the
    // verification email's link is clicked (see verifyEmail below), so
    // there's no refresh cookie to set and no accessToken to return.
    return this.authService.register(dto, lang);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('verify-email/:token')
  async verifyEmail(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyEmail(token);
    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resend-verification')
  async resendVerification(
    @Body() dto: LoginDto,
    @MailLang() lang: MailLanguage,
  ) {
    // Reuses LoginDto purely for its `email` field shape (already validated
    // as a proper email) -- no password involved here.
    await this.authService.resendVerificationEmail(dto.email, lang);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = this.readRefreshCookie(req);
    if (!presented) {
      throw new UnauthorizedException('Session invalide.');
    }
    const result = await this.authService.refresh(presented);
    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = this.readRefreshCookie(req);
    if (presented) {
      await this.authService.logout(presented);
    }
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_PATH });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.deleteAccount(user.id, dto);
    // Same clearing gesture as logout() above -- the account is gone, so
    // there's no refresh token left to explicitly revoke (the cascade on
    // User already deleted every RefreshToken row), just drop the cookie.
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_PATH });
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_TOKEN_COOKIE];
  }

  private setRefreshCookie(
    res: Response,
    token: string,
    expiresAt: Date,
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const options: CookieOptions = {
      httpOnly: true,
      // 'none' in production: the mobile app (Capacitor, origin
      // capacitor://localhost / https://localhost) calls this API
      // cross-origin -- 'lax' never sends the cookie on that fetch, which
      // would silently break refresh for every native client. Requires
      // `secure: true` (already the case in production, see below) --
      // browsers/webviews reject SameSite=None without it. Left as 'lax' in
      // non-production: local dev has no HTTPS, so 'none' would just get the
      // cookie dropped instead.
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      path: REFRESH_TOKEN_PATH,
      expires: expiresAt,
    };
    res.cookie(REFRESH_TOKEN_COOKIE, token, options);
  }
}
