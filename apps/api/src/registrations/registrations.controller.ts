import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from '../tournaments/decorators/require-tournament-permission.decorator';
import { TournamentPermissionGuard } from '../tournaments/guards/tournament-permission.guard';
import {
  RegistrationPaymentDto,
  RejectRegistrationDto,
} from './dto/registration-decision.dto';
import { RegistrationSettingsDto } from './dto/registration-settings.dto';
import { RegistrationsService } from './registrations.service';

// Reuses MANAGE_PARTICIPANTS rather than adding a new permission key --
// Tournify's own permission matrix (docs/product/roles-and-permissions.md,
// business-rules.md) has no distinct "payments" permission, and
// registrations are fundamentally participants joining a tournament.
@ApiTags('registrations')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller(
  'organizations/:organizationId/tournaments/:tournamentId/registrations',
)
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.registrationsService.listForOrganizer(
      organizationId,
      tournamentId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @Get('settings')
  getSettings(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.registrationsService.getSettings(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @Patch('settings')
  updateSettings(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: RegistrationSettingsDto,
  ) {
    return this.registrationsService.updateSettings(
      organizationId,
      tournamentId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @HttpCode(HttpStatus.OK)
  @Post(':registrationId/confirm')
  confirm(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.registrationsService.confirm(
      organizationId,
      tournamentId,
      registrationId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @HttpCode(HttpStatus.OK)
  @Post(':registrationId/reject')
  reject(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: RejectRegistrationDto,
  ) {
    return this.registrationsService.reject(
      organizationId,
      tournamentId,
      registrationId,
      dto.reason,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @HttpCode(HttpStatus.OK)
  @Post(':registrationId/waitlist')
  waitlist(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.registrationsService.waitlist(
      organizationId,
      tournamentId,
      registrationId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @Patch(':registrationId/payment')
  setPayment(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: RegistrationPaymentDto,
  ) {
    return this.registrationsService.setPayment(
      organizationId,
      tournamentId,
      registrationId,
      dto.paymentStatus,
    );
  }
}
