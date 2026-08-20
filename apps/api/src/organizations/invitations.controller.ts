import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import {
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_PATH,
} from '../auth/auth.controller';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@Public()
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get(':token')
  lookup(@Param('token') token: string) {
    return this.invitationsService.lookup(token);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post(':token/accept')
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    // OptionalJwtAuthGuard leaves request.user unset (null) rather than
    // throwing when there's no/invalid token — this route is reachable both
    // anonymously and authenticated, and the service branches on which.
    @CurrentUser() user: AuthenticatedUser | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.invitationsService.accept(token, user, dto);
    // Mirrors AuthController.login/register: when accepting creates a brand
    // new account, the service also issues a session -- the refresh token
    // must go into the same httpOnly cookie those flows use, never in the
    // JSON body (audit finding: it was previously readable by any script on
    // the page, e.g. via an XSS elsewhere on the same origin).
    if ('refreshToken' in result) {
      this.setRefreshCookie(
        res,
        result.refreshToken,
        result.refreshTokenExpiresAt,
      );
      return {
        organization: result.organization,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      };
    }
    return result;
  }

  private setRefreshCookie(
    res: Response,
    token: string,
    expiresAt: Date,
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const options: CookieOptions = {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      path: REFRESH_TOKEN_PATH,
      expires: expiresAt,
    };
    res.cookie(REFRESH_TOKEN_COOKIE, token, options);
  }
}
