import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { MailLang } from '../mail/decorators/mail-lang.decorator';
import type { MailLanguage } from '../mail/mail-language';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const REFRESH_TOKEN_PATH = '/api/v1/auth';
// Set (as a session cookie itself) when the user logged in without "Se
// souvenir de moi" -- tells refresh() to keep re-issuing the refresh cookie
// as a session cookie too, instead of turning it persistent on rotation.
export const SESSION_ONLY_COOKIE = 'session_only';

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
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('request-password-reset')
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @MailLang() lang: MailLanguage,
  ) {
    await this.authService.requestPasswordReset(dto.email, lang);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
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
    const persistent = dto.rememberMe !== false;
    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
      persistent,
    );
    if (persistent) {
      res.clearCookie(SESSION_ONLY_COOKIE, { path: REFRESH_TOKEN_PATH });
    } else {
      res.cookie(SESSION_ONLY_COOKIE, '1', {
        ...this.cookieBaseOptions(),
        path: REFRESH_TOKEN_PATH,
      });
    }
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
    const cookies = req.cookies as Record<string, string> | undefined;
    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
      !cookies?.[SESSION_ONLY_COOKIE],
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
    res.clearCookie(SESSION_ONLY_COOKIE, { path: REFRESH_TOKEN_PATH });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  @Patch('me/preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.authService.updatePreferences(user.id, dto);
  }

  /**
   * `confirmation` is a query param, not a DELETE body -- found the hard
   * way (2026-09, first real-device iOS test via TestFlight): a DELETE
   * request with a JSON body is technically legal HTTP, but WKWebView's own
   * fetch() implementation (what Capacitor's WebView uses on iOS once
   * CapacitorHttp is disabled, see capacitor.config.ts's own comment)
   * silently drops it in transit on-device -- worked perfectly through
   * every desktop-browser test this feature ever got (Chrome's fetch keeps
   * the body fine), never reproduced until an actual iPhone. A query
   * param sidesteps the whole class of "does this client/proxy forward a
   * DELETE body" ambiguity -- it's part of the URL, universally supported.
   */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Query('confirmation') confirmation: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.deleteAccount(user.id, {
      confirmation: confirmation ?? '',
    });
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
    persistent = true,
  ): void {
    res.cookie(REFRESH_TOKEN_COOKIE, token, {
      ...this.cookieBaseOptions(),
      path: REFRESH_TOKEN_PATH,
      // No expires = browser-session cookie ("Se souvenir de moi" unchecked).
      ...(persistent ? { expires: expiresAt } : {}),
    });
  }

  private cookieBaseOptions(): CookieOptions {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
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
    };
  }
}
