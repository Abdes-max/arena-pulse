import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { BracketsService } from './brackets.service';
import { CrossGroupQualificationRulesService } from './cross-group-qualification-rules.service';
import { SetTieBreakChoiceDto } from './dto/set-tie-break-choice.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { StandingsService } from './standings.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller(
  'organizations/:organizationId/tournaments/:tournamentId/groups/:groupId',
)
export class StandingsController {
  constructor(
    private readonly standingsService: StandingsService,
    private readonly crossGroupQualificationRulesService: CrossGroupQualificationRulesService,
    private readonly bracketsService: BracketsService,
  ) {}

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
  async getQualifications(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
  ) {
    // Direct per-pool rules (1st-2nd of this pool -> ...) and cross-group
    // rules (N best 3rd place across every pool -> ...) are both surfaced
    // here, merged into one flat list -- the standings page badges a
    // qualified team the same way regardless of which kind of rule got them
    // there.
    const [direct, crossGroup] = await Promise.all([
      this.standingsService.getQualifications(
        organizationId,
        tournamentId,
        groupId,
      ),
      this.crossGroupQualificationRulesService.getGroupQualifications(
        organizationId,
        tournamentId,
        groupId,
      ),
    ]);
    return [...direct, ...crossGroup];
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Post('tie-break-choice')
  async setTieBreakChoice(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
    @Body() dto: SetTieBreakChoiceDto,
  ) {
    const result = await this.standingsService.setManualTieBreakChoice(
      organizationId,
      tournamentId,
      groupId,
      dto.teamId,
    );
    // Same effect as validating a score in this pool -- if this was the
    // last thing keeping a fed knockout phase's round 1 undetermined, it
    // can resolve for real right away instead of waiting for an unrelated
    // score to be validated later.
    await this.bracketsService.tryResolveFirstRound(
      organizationId,
      tournamentId,
      groupId,
    );
    return result;
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Delete('tie-break-choice')
  clearTieBreakChoice(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.standingsService.clearManualTieBreakOrder(
      organizationId,
      tournamentId,
      groupId,
    );
  }
}
