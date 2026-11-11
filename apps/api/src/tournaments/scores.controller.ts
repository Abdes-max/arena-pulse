import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { ForfeitMatchDto } from './dto/forfeit-match.dto';
import { BatchMatchScoresDto } from './dto/batch-match-scores.dto';
import { ReopenPoolScoresDto } from './dto/reopen-pool-scores.dto';
import { UpsertMatchScoreDto } from './dto/upsert-match-score.dto';
import { PhaseScoresService } from './phase-scores.service';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { ScoresService } from './scores.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class ScoresController {
  constructor(
    private readonly scoresService: ScoresService,
    private readonly phaseScoresService: PhaseScoresService,
  ) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCORES')
  @Post('phases/:phaseId/scores/validate')
  validatePoolScores(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.phaseScoresService.validatePoolScores(
      organizationId,
      tournamentId,
      phaseId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCORES')
  @Post('phases/:phaseId/scores/reopen')
  reopenPoolScores(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: ReopenPoolScoresDto,
  ) {
    return this.phaseScoresService.reopenPoolScores(
      organizationId,
      tournamentId,
      phaseId,
      dto?.confirm === true,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCORES')
  @Post('matches/scores/batch')
  upsertScores(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: BatchMatchScoresDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scoresService.upsertScores(
      organizationId,
      tournamentId,
      dto,
      user.id,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCORES')
  @Put('matches/:matchId/score')
  upsertScore(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Body() dto: UpsertMatchScoreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scoresService.upsertScore(
      organizationId,
      tournamentId,
      matchId,
      dto,
      user.id,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCORES')
  @Post('matches/:matchId/score/validate')
  validateScore(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scoresService.validateScore(
      organizationId,
      tournamentId,
      matchId,
      user.id,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCORES')
  @Delete('matches/:matchId/score')
  clearScore(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
  ) {
    return this.scoresService.clearScore(organizationId, tournamentId, matchId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCORES')
  @Post('matches/:matchId/forfeit')
  declareForfeit(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Body() dto: ForfeitMatchDto,
  ) {
    return this.scoresService.declareForfeit(
      organizationId,
      tournamentId,
      matchId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCORES')
  @Delete('matches/:matchId/forfeit')
  undoForfeit(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
  ) {
    return this.scoresService.undoForfeit(
      organizationId,
      tournamentId,
      matchId,
    );
  }
}
