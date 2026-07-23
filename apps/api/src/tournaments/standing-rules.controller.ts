import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { UpdateStandingRuleDto } from './dto/update-standing-rule.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { StandingRulesService } from './standing-rules.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller(
  'organizations/:organizationId/tournaments/:tournamentId/groups/:groupId/standing-rule',
)
export class StandingRulesController {
  constructor(private readonly standingRulesService: StandingRulesService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get()
  get(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.standingRulesService.get(organizationId, tournamentId, groupId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Put()
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateStandingRuleDto,
  ) {
    return this.standingRulesService.update(
      organizationId,
      tournamentId,
      groupId,
      dto,
    );
  }
}
