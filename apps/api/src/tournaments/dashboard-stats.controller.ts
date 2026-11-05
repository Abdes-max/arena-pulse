import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { DashboardStatsService } from './dashboard-stats.service';

// Own path segments (dashboard-stats / :tournamentId/stats) rather than
// tournaments/stats, which TournamentsController's GET :tournamentId would
// otherwise swallow as a tournament id.
@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard)
@Controller('organizations/:organizationId')
export class DashboardStatsController {
  constructor(private readonly dashboardStatsService: DashboardStatsService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('dashboard-stats')
  getOrganizationStats(@Param('organizationId') organizationId: string) {
    return this.dashboardStatsService.getOrganizationStats(organizationId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('tournaments/:tournamentId/stats')
  getTournamentStats(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.dashboardStatsService.getTournamentStats(
      organizationId,
      tournamentId,
    );
  }
}
