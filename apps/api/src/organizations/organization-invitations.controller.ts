import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from './decorators/require-org-role.decorator';
import { InviteMemberDto } from './dto/invite-member.dto';
import { OrganizationRoleGuard } from './guards/organization-role.guard';
import { InvitationsService } from './invitations.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('organizations')
@UseGuards(OrganizationRoleGuard)
@RequireOrgRole(OrganizationRole.ORG_ADMIN)
@Controller('organizations/:organizationId/invitations')
export class OrganizationInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  invite(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteMemberDto,
  ) {
    return this.invitationsService.invite(organizationId, user.id, dto);
  }

  @Get()
  listPending(@Param('organizationId') organizationId: string) {
    return this.invitationsService.listPending(organizationId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':invitationId')
  revoke(
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.revoke(organizationId, invitationId);
  }
}
