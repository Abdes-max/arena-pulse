import {
  Body,
  Controller,
  Delete,
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
import { Public } from '../auth/decorators/public.decorator';
import { CurrentSuperAdmin } from './decorators/current-super-admin.decorator';
import { DeleteSuperAdminAccountDto } from './dto/delete-super-admin-account.dto';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';
import { SuperAdminJwtAuthGuard } from './guards/super-admin-jwt-auth.guard';
import { SuperAdminAuthService } from './super-admin-auth.service';
import type { AuthenticatedSuperAdmin } from './strategies/super-admin-jwt.strategy';

// A distinct name/path from the organizer's and player's refresh cookies --
// all three can coexist in the same browser without colliding.
export const SUPER_ADMIN_REFRESH_TOKEN_COOKIE = 'super_admin_refresh_token';
export const SUPER_ADMIN_REFRESH_TOKEN_PATH = '/api/v1/super-admin-auth';

// Tighter than the organizer/player AUTH_THROTTLE (5/min) -- this account
// can see and act on every organization on the platform, so the blast
// radius of credential stuffing here is much larger.
const SUPER_ADMIN_AUTH_THROTTLE = {
  default: {
    limit: process.env.NODE_ENV === 'test' ? 100_000 : 3,
    ttl: 60_000,
  },
};

// No register endpoint here, deliberately -- see SuperAdminAuthService.
@ApiTags('super-admin-auth')
@Controller('super-admin-auth')
export class SuperAdminAuthController {
  constructor(private readonly superAdminAuthService: SuperAdminAuthService) {}

  @Public()
  @Throttle(SUPER_ADMIN_AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: SuperAdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.superAdminAuthService.login(dto);
    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      superAdmin: result.superAdmin,
    };
  }

  @Public()
  @Throttle(SUPER_ADMIN_AUTH_THROTTLE)
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
    const result = await this.superAdminAuthService.refresh(presented);
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
      await this.superAdminAuthService.logout(presented);
    }
    res.clearCookie(SUPER_ADMIN_REFRESH_TOKEN_COOKIE, {
      path: SUPER_ADMIN_REFRESH_TOKEN_PATH,
    });
  }

  @Public()
  @UseGuards(SuperAdminJwtAuthGuard)
  @Get('me')
  me(@CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin) {
    return this.superAdminAuthService.getProfile(superAdmin.id);
  }

  @Public()
  @UseGuards(SuperAdminJwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  async deleteAccount(
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
    @Body() dto: DeleteSuperAdminAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.superAdminAuthService.deleteAccount(superAdmin.id, dto);
    res.clearCookie(SUPER_ADMIN_REFRESH_TOKEN_COOKIE, {
      path: SUPER_ADMIN_REFRESH_TOKEN_PATH,
    });
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[SUPER_ADMIN_REFRESH_TOKEN_COOKIE];
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
      // setRefreshCookie -- same cross-origin-from-native-app reasoning
      // (this dashboard is web-only today, but kept consistent).
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      path: SUPER_ADMIN_REFRESH_TOKEN_PATH,
      expires: expiresAt,
    };
    res.cookie(SUPER_ADMIN_REFRESH_TOKEN_COOKIE, token, options);
  }
}
