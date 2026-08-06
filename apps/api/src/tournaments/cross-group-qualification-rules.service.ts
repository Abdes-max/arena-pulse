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
import { ordinal } from './ordinal.util';
import { PhasesService } from './phases.service';
import { DEFAULT_TIE_BREAK_ORDER } from './standing-rule.constants';
import {
  CrossGroupCandidate,
  findUnresolvedTies,
  rankCrossGroupCandidates,
} from './standings.util';
import { QualificationResult, StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type RuleWithTargetPhase = CrossGroupQualificationRule & {
  targetPhase: { name: string };
};

// One bracket slot fed by a qualification source: `teamId` is the real team
// once its source pool(s) are complete, `label` is always present (e.g.
// "1er meilleur 3e") for display while `teamId` is still null.
export interface QualificationSlot {
  teamId: string | null;
  label: string;
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
   * Used by BracketsService.resolveQualificationSlots to fold cross-group
   * qualifiers (e.g. "8 best 3rd places") into the same slot list as regular
   * per-group QualificationRule entries. A slot's `teamId` stays null until
   * *every* pool feeding its rule is complete (`StandingsService.isComplete`)
   * -- which pool ends up e.g. "best 3rd place" is only known once every
   * source pool's real standings are final, so the label can never name a
   * specific pool, only the rank among the best-of-position candidates
   * (e.g. "1er meilleur 3e") -- naming a pool here would be actively
   * misleading before that point.
   */
  async resolveSlots(
    organizationId: string,
    tournamentId: string,
    targetPhaseId: string,
  ): Promise<QualificationSlot[]> {
    const rules = await this.prisma.crossGroupQualificationRule.findMany({
      where: { targetPhaseId },
      // Deterministic order across calls -- resolveSlots is called once at
      // generation time (pools maybe incomplete) and again later once
      // they're complete; both calls must enumerate slots in the same
      // order for a bracket's fixed seeding positions to stay meaningful.
      orderBy: { createdAt: 'asc' },
    });
    const slots: QualificationSlot[] = [];
    for (const rule of rules) {
      const ranking = await this.rankRule(organizationId, tournamentId, rule, {
        rankEvenIfIncomplete: false,
      });
      if (!ranking) {
        continue;
      }
      if (!ranking.allComplete) {
        for (let i = 0; i < rule.bestCount; i++) {
          slots.push({
            teamId: null,
            label: `${ordinal(i + 1)} meilleur ${ordinal(rule.position)}`,
          });
        }
        continue;
      }
      // A candidate still tied against another (see StandingsController's
      // tie-break-choice endpoint) keeps its team withheld here too -- same
      // treatment as a source pool that isn't complete yet -- until the
      // organizer picks who actually takes the slot.
      const tiedTeamIds = new Set(ranking.unresolvedTies.flat());
      ranking.ranked.slice(0, rule.bestCount).forEach((row, index) => {
        slots.push({
          teamId: tiedTeamIds.has(row.teamId) ? null : row.teamId,
          label: `${ordinal(index + 1)} meilleur ${ordinal(rule.position)}`,
        });
      });
    }
    return slots;
  }

  /**
   * Cross-group qualifications for ONE pool's standings display -- unlike
   * resolveSlots above (bracket generation, which needs a *confirmed* team
   * and withholds it until every source pool is complete), this always
   * ranks off the CURRENT standings, same convention as the direct per-pool
   * QualificationRule case (StandingsService.getQualifications, which never
   * checks isComplete either) -- so a pool that isn't finished yet still
   * shows its provisional cross-group qualifiers, caveated by the group's
   * own "(provisoire)" flag in the standings table rather than hidden
   * outright.
   */
  async getGroupQualifications(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<QualificationResult[]> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { phaseId: true },
    });
    if (!group) {
      return [];
    }
    const rules = await this.prisma.crossGroupQualificationRule.findMany({
      where: { phaseId: group.phaseId },
      include: { targetPhase: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const results: QualificationResult[] = [];
    for (const rule of rules) {
      const ranking = await this.rankRule(organizationId, tournamentId, rule, {
        rankEvenIfIncomplete: true,
      });
      const tiedTeamIds = new Set(ranking?.unresolvedTies.flat() ?? []);
      const qualifiedTeams = (ranking?.ranked ?? [])
        .slice(0, rule.bestCount)
        .filter(
          (row) => row.groupId === groupId && !tiedTeamIds.has(row.teamId),
        )
        .map((row) => ({
          id: row.teamId,
          name: row.teamName,
          // The pool's own position (e.g. 3rd) -- not rankCrossGroupCandidates'
          // reassigned `position` (rank among cross-group candidates, e.g.
          // "1st best 3rd"), which the label already conveys separately.
          position: rule.position,
        }));
      results.push({
        ruleId: rule.id,
        fromPosition: rule.position,
        toPosition: rule.position,
        targetPhaseId: rule.targetPhaseId,
        targetPhaseName: rule.targetPhase.name,
        qualifiedTeams,
      });
    }
    return results;
  }

  /**
   * Every cross-group rule sourced from `phaseId` that currently has an
   * unresolved tie affecting who takes one of its `bestCount` slots (a tie
   * entirely below the cutoff -- both candidates already eliminated either
   * way -- isn't surfaced, nothing actionable about it).
   */
  async getUnresolvedTies(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
  ): Promise<
    {
      ruleId: string;
      targetPhaseName: string;
      position: number;
      ties: { teams: { id: string; name: string; groupName: string }[] }[];
    }[]
  > {
    const rules = await this.prisma.crossGroupQualificationRule.findMany({
      where: { phaseId },
      include: { targetPhase: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const results: {
      ruleId: string;
      targetPhaseName: string;
      position: number;
      ties: { teams: { id: string; name: string; groupName: string }[] }[];
    }[] = [];
    for (const rule of rules) {
      const ranking = await this.rankRule(organizationId, tournamentId, rule, {
        rankEvenIfIncomplete: true,
      });
      if (!ranking || ranking.unresolvedTies.length === 0) {
        continue;
      }
      const rowById = new Map(ranking.ranked.map((row) => [row.teamId, row]));
      const relevantTies = ranking.unresolvedTies
        .filter((teamIds) =>
          teamIds.some(
            (teamId) =>
              ranking.ranked.findIndex((row) => row.teamId === teamId) <
              rule.bestCount,
          ),
        )
        .map((teamIds) => ({
          teams: teamIds.map((teamId) => {
            const row = rowById.get(teamId)!;
            return {
              id: row.teamId,
              name: row.teamName,
              groupName: row.groupName,
            };
          }),
        }));
      if (relevantTies.length > 0) {
        results.push({
          ruleId: rule.id,
          targetPhaseName: rule.targetPhase.name,
          position: rule.position,
          ties: relevantTies,
        });
      }
    }
    return results;
  }

  /** Same mechanism as StandingsService.setManualTieBreakChoice, scoped to this rule's own cross-group candidate pool. */
  async setManualTieBreakChoice(
    organizationId: string,
    tournamentId: string,
    ruleId: string,
    teamId: string,
  ): Promise<{ phaseId: string }> {
    const rule = await this.getOrThrowForTournament(tournamentId, ruleId);
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    if (!rule.manualTieBreakOrder.includes(teamId)) {
      await this.prisma.crossGroupQualificationRule.update({
        where: { id: ruleId },
        data: {
          manualTieBreakOrder: [...rule.manualTieBreakOrder, teamId],
        },
      });
    }
    return { phaseId: rule.phaseId };
  }

  async clearManualTieBreakOrder(
    organizationId: string,
    tournamentId: string,
    ruleId: string,
  ): Promise<void> {
    await this.getOrThrowForTournament(tournamentId, ruleId);
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.prisma.crossGroupQualificationRule.update({
      where: { id: ruleId },
      data: { manualTieBreakOrder: [] },
    });
  }

  private async rankRule(
    organizationId: string,
    tournamentId: string,
    rule: CrossGroupQualificationRule,
    options: { rankEvenIfIncomplete: boolean },
  ): Promise<{
    ranked: CrossGroupCandidate[];
    allComplete: boolean;
    // Team IDs still genuinely tied against each other within `ranked`, once
    // this rule's own manualTieBreakOrder is applied -- see
    // standings.util.findUnresolvedTies.
    unresolvedTies: string[][];
  } | null> {
    const groups = await this.prisma.group.findMany({
      where: { phaseId: rule.phaseId },
      select: { id: true, name: true },
    });
    if (groups.length === 0) {
      return null;
    }
    const standingsByGroup = await Promise.all(
      groups.map(async (group) => ({
        group,
        standings: await this.standingsService.getStandings(
          organizationId,
          tournamentId,
          group.id,
        ),
      })),
    );
    const allComplete = standingsByGroup.every(
      ({ standings }) => standings.isComplete,
    );
    // Skips the tie-break lookup and ranking entirely when nothing will use
    // them (resolveSlots only wants a real ranking once every source pool
    // is complete -- see its own doc comment).
    if (!allComplete && !options.rankEvenIfIncomplete) {
      return { ranked: [], allComplete, unresolvedTies: [] };
    }
    const tieBreakOrder =
      (
        await this.prisma.standingRule.findUnique({
          where: { groupId: groups[0].id },
        })
      )?.tieBreakOrder ?? DEFAULT_TIE_BREAK_ORDER;
    const manualTieBreakOrder = rule.manualTieBreakOrder ?? [];
    const pools = standingsByGroup.map(({ group, standings }) => ({
      groupId: group.id,
      groupName: group.name,
      rows: standings.rows,
    }));
    const ranked = rankCrossGroupCandidates(
      pools,
      rule.position,
      tieBreakOrder,
      manualTieBreakOrder,
    );
    const unresolvedTies = findUnresolvedTies(
      ranked,
      [],
      tieBreakOrder,
      { winPoints: 0, drawPoints: 0, lossPoints: 0 },
      manualTieBreakOrder,
    );
    return { ranked, allComplete, unresolvedTies };
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
