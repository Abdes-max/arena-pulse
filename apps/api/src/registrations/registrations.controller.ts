import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from '../tournaments/decorators/require-tournament-permission.decorator';
import { TournamentPermissionGuard } from '../tournaments/guards/tournament-permission.guard';
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
}
