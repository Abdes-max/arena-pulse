import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_RATING, DEFAULT_RATING_DEVIATION } from './glicko2.util';
import { GroupsService } from './groups.service';
import { RatingsService } from './ratings.service';
import { computeStandings, StandingRow } from './standings.util';
import { TournamentsService } from './tournaments.service';

const PROVISIONAL_RATING_DEVIATION_THRESHOLD = 100;

export interface StandingRowWithRating extends StandingRow {
  rating: number;
  ratingDeviation: number;
  isProvisional: boolean;
}

export interface StandingsResult {
  rows: StandingRowWithRating[];
  isComplete: boolean;
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
    await this.groupsService.assertGroupExists(tournamentId, groupId);

    const [teams, matches, standingRule] = await Promise.all([
      this.prisma.team.findMany({
        where: { groupId },
        select: { id: true, name: true },
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

    const rows = computeStandings(
      teams,
      validatedMatches,
      {
        winPoints: standingRule?.winPoints ?? 3,
        drawPoints: standingRule?.drawPoints ?? 1,
        lossPoints: standingRule?.lossPoints ?? 0,
      },
      standingRule?.tieBreakOrder ?? [
        'POINTS',
        'GOAL_DIFFERENCE',
        'GOALS_SCORED',
        'HEAD_TO_HEAD',
      ],
    );

    const isComplete =
      matches.length > 0 &&
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

    return { rows: rowsWithRating, isComplete };
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
