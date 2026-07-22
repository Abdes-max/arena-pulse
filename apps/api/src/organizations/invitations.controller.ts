import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
  accept(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    // OptionalJwtAuthGuard leaves request.user unset (null) rather than
    // throwing when there's no/invalid token — this route is reachable both
    // anonymously and authenticated, and the service branches on which.
    @CurrentUser() user: AuthenticatedUser | null,
  ) {
    return this.invitationsService.accept(token, user, dto);
  }
}
