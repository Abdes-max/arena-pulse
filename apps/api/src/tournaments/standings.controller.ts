import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { StandingsService } from './standings.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller(
  'organizations/:organizationId/tournaments/:tournamentId/groups/:groupId',
)
export class StandingsController {
  constructor(private readonly standingsService: StandingsService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('standings')
  getStandings(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.standingsService.getStandings(
      organizationId,
      tournamentId,
      groupId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('qualifications')
  getQualifications(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.standingsService.getQualifications(
      organizationId,
      tournamentId,
      groupId,
    );
  }
}
