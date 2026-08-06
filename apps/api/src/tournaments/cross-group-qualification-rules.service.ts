import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompetitionPhaseType,
  CrossGroupQualificationRule,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCrossGroupQualificationRuleDto } from './dto/create-cross-group-qualification-rule.dto';
import { PhasesService } from './phases.service';
import { DEFAULT_TIE_BREAK_ORDER } from './standing-rule.constants';
import { rankCrossGroupCandidates } from './standings.util';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type RuleWithTargetPhase = CrossGroupQualificationRule & {
  targetPhase: { name: string };
};

export interface CrossGroupQualifiedEntry {
  teamId: string;
  position: number;
  groupName: string;
}

@Injectable()
export class CrossGroupQualificationRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly phasesService: PhasesService,
    private readonly standingsService: StandingsService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    dto: CreateCrossGroupQualificationRuleDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const phase = await this.phasesService.assertPhaseExists(
      tournamentId,
      phaseId,
    );
    if (phase.type !== CompetitionPhaseType.GROUP_STAGE) {
      throw new BadRequestException(
        'Ces règles ne peuvent être créées que sur une phase de poules.',
      );
    }
    const targetPhase = await this.phasesService.assertPhaseExists(
      tournamentId,
      dto.targetPhaseId,
    );
    if (targetPhase.categoryId !== phase.categoryId) {
      throw new BadRequestException(
        'La phase cible doit appartenir à la même catégorie que la phase source.',
      );
    }
    if (targetPhase.id === phase.id) {
      throw new BadRequestException(
        'La phase cible doit être différente de la phase source.',
      );
    }

    const rule = await this.prisma.crossGroupQualificationRule.create({
      data: {
        phaseId,
        position: dto.position,
        bestCount: dto.bestCount,
        targetPhaseId: dto.targetPhaseId,
      },
      include: { targetPhase: true },
    });
    return this.toSummary(rule);
  }

  async list(organizationId: string, tournamentId: string, phaseId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.phasesService.assertPhaseExists(tournamentId, phaseId);
    const rules = await this.prisma.crossGroupQualificationRule.findMany({
      where: { phaseId },
      include: { targetPhase: true },
      orderBy: { position: 'asc' },
    });
    return rules.map((rule) => this.toSummary(rule));
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    ruleId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, ruleId);
    await this.prisma.crossGroupQualificationRule.delete({
      where: { id: ruleId },
    });
  }

  /**
   * Used by BracketsService.collectQualifiedTeams to fold cross-group
   * qualifiers (e.g. "8 best 3rd places") into the same qualified-teams
   * list as regular per-group QualificationRule entries.
   */
  async collectQualifiedTeams(
    organizationId: string,
    tournamentId: string,
    targetPhaseId: string,
  ): Promise<CrossGroupQualifiedEntry[]> {
    const rules = await this.prisma.crossGroupQualificationRule.findMany({
      where: { targetPhaseId },
    });
    const entries: CrossGroupQualifiedEntry[] = [];
    for (const rule of rules) {
      const groups = await this.prisma.group.findMany({
        where: { phaseId: rule.phaseId },
        select: { id: true, name: true },
      });
      if (groups.length === 0) {
        continue;
      }
      const tieBreakOrder =
        (
          await this.prisma.standingRule.findUnique({
            where: { groupId: groups[0].id },
          })
        )?.tieBreakOrder ?? DEFAULT_TIE_BREAK_ORDER;

      const pools = await Promise.all(
        groups.map(async (group) => ({
          groupId: group.id,
          groupName: group.name,
          rows: (
            await this.standingsService.getStandings(
              organizationId,
              tournamentId,
              group.id,
            )
          ).rows,
        })),
      );
      const ranked = rankCrossGroupCandidates(
        pools,
        rule.position,
        tieBreakOrder,
      );
      for (const row of ranked.slice(0, rule.bestCount)) {
        entries.push({
          teamId: row.teamId,
          position: row.position,
          groupName: `${row.groupName} (${rule.position}e)`,
        });
      }
    }
    return entries;
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    ruleId: string,
  ): Promise<CrossGroupQualificationRule> {
    const rule = await this.prisma.crossGroupQualificationRule.findUnique({
      where: { id: ruleId },
      include: { phase: { include: { category: true } } },
    });
    if (!rule || rule.phase.category.tournamentId !== tournamentId) {
      throw new NotFoundException('Règle introuvable.');
    }
    return rule;
  }

  private toSummary(rule: RuleWithTargetPhase) {
    return {
      id: rule.id,
      phaseId: rule.phaseId,
      position: rule.position,
      bestCount: rule.bestCount,
      targetPhaseId: rule.targetPhaseId,
      targetPhaseName: rule.targetPhase.name,
    };
  }
}
