import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  NATIVE_CLIENT_HEADER,
  NATIVE_CLIENT_VALUE,
} from '../auth/auth.controller';
import { Public } from '../auth/decorators/public.decorator';
import { RefreshDto } from '../auth/dto/refresh.dto';
import { CurrentPlayer } from './decorators/current-player.decorator';
import { PlayerLoginDto } from './dto/player-login.dto';
import { PlayerRegisterDto } from './dto/player-register.dto';
import { PlayerJwtAuthGuard } from './guards/player-jwt-auth.guard';
import { PlayerAuthService } from './player-auth.service';
import type { AuthenticatedPlayer } from './strategies/player-jwt.strategy';

// A distinct name/path from the organizer's refresh_token cookie
// (auth.controller.ts) -- both can coexist in the same browser (someone
// managing a tournament while also registered as a player elsewhere)
// without colliding.
export const PLAYER_REFRESH_TOKEN_COOKIE = 'player_refresh_token';
export const PLAYER_REFRESH_TOKEN_PATH = '/api/v1/player-auth';

const AUTH_THROTTLE = {
  default: {
    limit: process.env.NODE_ENV === 'test' ? 100_000 : 5,
    ttl: 60_000,
  },
};

@ApiTags('player-auth')
@Controller('player-auth')
export class PlayerAuthController {
  constructor(private readonly playerAuthService: PlayerAuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(
    @Body() dto: PlayerRegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.playerAuthService.register(dto);
    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      playerAccount: result.playerAccount,
      ...this.nativeRefreshBody(req, result.refreshToken),
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: PlayerLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.playerAuthService.login(dto);
    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      playerAccount: result.playerAccount,
      ...this.nativeRefreshBody(req, result.refreshToken),
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = this.readRefreshCookie(req) ?? dto?.refreshToken;
    if (!presented) {
      throw new UnauthorizedException('Session invalide.');
    }
    const result = await this.playerAuthService.refresh(presented);
    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      ...this.nativeRefreshBody(req, result.refreshToken),
    };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = this.readRefreshCookie(req) ?? dto?.refreshToken;
    if (presented) {
      await this.playerAuthService.logout(presented);
    }
    res.clearCookie(PLAYER_REFRESH_TOKEN_COOKIE, {
      path: PLAYER_REFRESH_TOKEN_PATH,
    });
  }

  @Public()
  @UseGuards(PlayerJwtAuthGuard)
  @Get('me')
  me(@CurrentPlayer() player: AuthenticatedPlayer) {
    return this.playerAuthService.getProfile(player.id);
  }

  /**
   * Same native mode as the organizer's AuthController: the mobile app sends
   * x-client: native and keeps the refresh token in its own storage (the
   * webview's cross-site cookie is not reliable on iOS), so it gets it back
   * in the body here and presents it in the body to refresh/logout.
   */
  private nativeRefreshBody(
    req: Request,
    refreshToken: string,
  ): { refreshToken?: string } {
    return req.header(NATIVE_CLIENT_HEADER) === NATIVE_CLIENT_VALUE
      ? { refreshToken }
      : {};
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[PLAYER_REFRESH_TOKEN_COOKIE];
  }

  private setRefreshCookie(
    res: Response,
    token: string,
    expiresAt: Date,
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const options: CookieOptions = {
      httpOnly: true,
      // See the identical comment in auth/auth.controller.ts's
      // setRefreshCookie -- same cross-origin-from-native-app reasoning.
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      path: PLAYER_REFRESH_TOKEN_PATH,
      expires: expiresAt,
    };
    res.cookie(PLAYER_REFRESH_TOKEN_COOKIE, token, options);
  }
}
