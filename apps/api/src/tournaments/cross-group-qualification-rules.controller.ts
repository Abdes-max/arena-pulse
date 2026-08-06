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
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { BracketsService } from './brackets.service';
import { CrossGroupQualificationRulesService } from './cross-group-qualification-rules.service';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { CreateCrossGroupQualificationRuleDto } from './dto/create-cross-group-qualification-rule.dto';
import { SetTieBreakChoiceDto } from './dto/set-tie-break-choice.dto';
import { GroupsService } from './groups.service';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class CrossGroupQualificationRulesController {
  constructor(
    private readonly crossGroupQualificationRulesService: CrossGroupQualificationRulesService,
    private readonly bracketsService: BracketsService,
    private readonly groupsService: GroupsService,
  ) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Post('phases/:phaseId/cross-group-qualification-rules')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: CreateCrossGroupQualificationRuleDto,
  ) {
    return this.crossGroupQualificationRulesService.create(
      organizationId,
      tournamentId,
      phaseId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('phases/:phaseId/cross-group-qualification-rules')
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.crossGroupQualificationRulesService.list(
      organizationId,
      tournamentId,
      phaseId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('cross-group-qualification-rules/:ruleId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.crossGroupQualificationRulesService.remove(
      organizationId,
      tournamentId,
      ruleId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('phases/:phaseId/cross-group-qualification-rules/unresolved-ties')
  getUnresolvedTies(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.crossGroupQualificationRulesService.getUnresolvedTies(
      organizationId,
      tournamentId,
      phaseId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Post('cross-group-qualification-rules/:ruleId/tie-break-choice')
  async setTieBreakChoice(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: SetTieBreakChoiceDto,
  ) {
    const { phaseId } =
      await this.crossGroupQualificationRulesService.setManualTieBreakChoice(
        organizationId,
        tournamentId,
        ruleId,
        dto.teamId,
      );
    // Same effect as validating a pool score -- if this was the last thing
    // keeping a fed knockout phase's round 1 undetermined, it can resolve
    // for real right away. A cross-group rule draws from every pool in its
    // source phase, so any of them completing (or being re-checked here)
    // could be the one that unblocks it.
    const groups = await this.groupsService.list(
      organizationId,
      tournamentId,
      phaseId,
    );
    for (const group of groups) {
      await this.bracketsService.tryResolveFirstRound(
        organizationId,
        tournamentId,
        group.id,
      );
    }
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Delete('cross-group-qualification-rules/:ruleId/tie-break-choice')
  clearTieBreakChoice(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.crossGroupQualificationRulesService.clearManualTieBreakOrder(
      organizationId,
      tournamentId,
      ruleId,
    );
  }
}
