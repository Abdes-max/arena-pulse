import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_RATING, DEFAULT_RATING_DEVIATION } from './glicko2.util';
import { GroupsService } from './groups.service';
import { RatingsService } from './ratings.service';
import {
  computeStandings,
  findUnresolvedTies,
  StandingRow,
} from './standings.util';
import { TournamentsService } from './tournaments.service';

const PROVISIONAL_RATING_DEVIATION_THRESHOLD = 100;
const DEFAULT_TIE_BREAK_ORDER = [
  'POINTS',
  'GOAL_DIFFERENCE',
  'GOALS_SCORED',
  'HEAD_TO_HEAD',
];

export interface StandingRowWithRating extends StandingRow {
  rating: number;
  ratingDeviation: number;
  isProvisional: boolean;
}

export interface UnresolvedTie {
  teams: { id: string; name: string }[];
}

export interface StandingsResult {
  rows: StandingRowWithRating[];
  isComplete: boolean;
  // Groups of 2+ teams still genuinely indistinguishable once every scoring
  // criterion (and any earlier organizer pick) is exhausted -- see
  // findUnresolvedTies. Currently ordered alphabetically among themselves
  // (rows above), pending a manual pick via setManualTieBreakChoice.
  unresolvedTies: UnresolvedTie[];
}

export interface QualificationResult {
  ruleId: string;
  fromPosition: number;
  toPosition: number;
  targetPhaseId: string;
  targetPhaseName: string;
  qualifiedTeams: { id: string; name: string; position: number }[];
}

@Injectable()
export class StandingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly groupsService: GroupsService,
    private readonly ratingsService: RatingsService,
  ) {}

  async getStandings(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<StandingsResult> {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const group = await this.groupsService.assertGroupExists(
      tournamentId,
      groupId,
    );

    const [teams, matches, standingRule] = await Promise.all([
      this.prisma.team.findMany({
        where: { groupId },
        select: { id: true, name: true, logoUrl: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.match.findMany({
        where: { groupId },
        select: {
          homeTeamId: true,
          awayTeamId: true,
          score: {
            select: { homeScore: true, awayScore: true, isValidated: true },
          },
        },
      }),
      this.prisma.standingRule.findUnique({ where: { groupId } }),
    ]);

    const validatedMatches = matches
      .filter(
        (
          match,
        ): match is typeof match & { homeTeamId: string; awayTeamId: string } =>
          match.homeTeamId !== null &&
          match.awayTeamId !== null &&
          match.score?.isValidated === true,
      )
      .map((match) => ({
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeScore: match.score!.homeScore,
        awayScore: match.score!.awayScore,
      }));

    const scheme = {
      winPoints: standingRule?.winPoints ?? 3,
      drawPoints: standingRule?.drawPoints ?? 1,
      lossPoints: standingRule?.lossPoints ?? 0,
    };
    const tieBreakOrder =
      standingRule?.tieBreakOrder ?? DEFAULT_TIE_BREAK_ORDER;
    const manualTieBreakOrder = standingRule?.manualTieBreakOrder ?? [];
    const rows = computeStandings(
      teams,
      validatedMatches,
      scheme,
      tieBreakOrder,
      manualTieBreakOrder,
    );
    const teamNameById = new Map(rows.map((row) => [row.teamId, row.teamName]));
    // A KNOCKOUT_ONLY structure preset's fictitious seed group (see
    // CompetitionPhase.isSeedPhase) never has any match to play, by design
    // -- every team ties on every criterion, always. Flagging that as an
    // "unresolved tie" needing an organizer's pick makes no sense here
    // (there's no fairness question, just an arbitrary flat list): the
    // deterministic alphabetical fallback computeStandings already applies
    // is exactly the intended seeding, so ties are never reported for it.
    const unresolvedTies: UnresolvedTie[] = group.phase.isSeedPhase
      ? []
      : findUnresolvedTies(
          rows,
          validatedMatches,
          tieBreakOrder,
          scheme,
          manualTieBreakOrder,
        ).map((teamIds) => ({
          teams: teamIds.map((teamId) => ({
            id: teamId,
            name: teamNameById.get(teamId) ?? teamId,
          })),
        }));

    // Same reasoning: a seed group is trivially "complete" the moment it
    // exists (nothing is ever scheduled in it), unlike a real pool with no
    // matches generated yet, which must stay incomplete until it has some.
    const isComplete = group.phase.isSeedPhase
      ? true
      : matches.length > 0 &&
        matches.every((match) => match.score?.isValidated === true);

    const ratingsByTeamName = await this.ratingsService.getRatingsForTeamNames(
      organizationId,
      teams.map((team) => team.name),
    );
    const rowsWithRating = rows.map((row) => {
      const rating = ratingsByTeamName.get(row.teamName);
      return {
        ...row,
        rating: rating?.rating ?? DEFAULT_RATING,
        ratingDeviation: rating?.ratingDeviation ?? DEFAULT_RATING_DEVIATION,
        isProvisional:
          (rating?.ratingDeviation ?? DEFAULT_RATING_DEVIATION) >
          PROVISIONAL_RATING_DEVIATION_THRESHOLD,
      };
    });

    return { rows: rowsWithRating, isComplete, unresolvedTies };
  }

  /**
   * Records the organizer's pick for the next still-tied subgroup (see
   * StandingsResult.unresolvedTies) -- appended, not replacing the whole
   * order, since resolving a 3+-way tie takes one pick per remaining
   * subgroup (see standings.util.findUnresolvedTies' own doc comment).
   * No-ops if this team was already picked.
   */
  async setManualTieBreakChoice(
    organizationId: string,
    tournamentId: string,
    groupId: string,
    teamId: string,
  ): Promise<StandingsResult> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.groupsService.assertGroupExists(tournamentId, groupId);
    const rule = await this.prisma.standingRule.findUnique({
      where: { groupId },
    });
    const current = rule?.manualTieBreakOrder ?? [];
    if (!current.includes(teamId)) {
      await this.prisma.standingRule.update({
        where: { groupId },
        data: { manualTieBreakOrder: [...current, teamId] },
      });
    }
    return this.getStandings(organizationId, tournamentId, groupId);
  }

  /** Reverts to the plain alphabetical fallback for this group's ties. */
  async clearManualTieBreakOrder(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<StandingsResult> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.groupsService.assertGroupExists(tournamentId, groupId);
    await this.prisma.standingRule.update({
      where: { groupId },
      data: { manualTieBreakOrder: [] },
    });
    return this.getStandings(organizationId, tournamentId, groupId);
  }

  async getQualifications(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<QualificationResult[]> {
    const { rows } = await this.getStandings(
      organizationId,
      tournamentId,
      groupId,
    );
    const rules = await this.prisma.qualificationRule.findMany({
      where: { groupId },
      include: { targetPhase: { select: { name: true } } },
      orderBy: { fromPosition: 'asc' },
    });

    return rules.map((rule) => ({
      ruleId: rule.id,
      fromPosition: rule.fromPosition,
      toPosition: rule.toPosition,
      targetPhaseId: rule.targetPhaseId,
      targetPhaseName: rule.targetPhase.name,
      qualifiedTeams: rows
        .filter(
          (row) =>
            row.position >= rule.fromPosition &&
            row.position <= rule.toPosition,
        )
        .map((row) => ({
          id: row.teamId,
          name: row.teamName,
          position: row.position,
        })),
    }));
  }
}
