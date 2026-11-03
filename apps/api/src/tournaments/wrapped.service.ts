import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getWinnerTeamId } from './match-outcome.util';
import { RatingsService } from './ratings.service';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';
import {
  computeMatchStats,
  findBiggestUpset,
  MatchHighlight,
  MatchOutcomeBreakdown,
  NamedCount,
  RatingHistoryEntry,
  TeamGoalTally,
  WrappedMatchInput,
} from './wrapped.util';

interface WrappedChampion {
  categoryId: string;
  categoryName: string;
  teamName: string;
  rating: number;
}

interface WrappedUpset {
  winnerTeamName: string;
  loserTeamName: string;
  winnerRatingBefore: number;
  loserRatingBefore: number;
}

export type TournamentWrapped =
  | { unlocked: false }
  | {
      unlocked: true;
      organisation: {
        teamsCount: number;
        categoriesCount: number;
        groupsCount: number;
        venuesCount: number;
        refereesCount: number;
        startDate: Date | null;
        endDate: Date | null;
      };
      goals: {
        totalGoals: number;
        averageGoalsPerMatch: number;
        matchesPlayed: number;
        highestScoringMatch: MatchHighlight | null;
        biggestWinMargin: MatchHighlight | null;
        closestMatch: MatchHighlight | null;
      };
      outcomes: MatchOutcomeBreakdown;
      venues: NamedCount[];
      matchesByHour: NamedCount[];
      topAttack: TeamGoalTally[];
      topDefense: TeamGoalTally[];
      level: {
        champions: WrappedChampion[];
        biggestUpset: WrappedUpset | null;
      };
    };

/**
 * Builds the public "Tournoi Wrapped" recap (GET /public/tournaments/:slug/wrapped)
 * entirely from data that already exists — validated scores, referees, fields
 * and the Glicko-2 ratings ratings.service.ts already maintains — see this
 * feature's plan doc (adaptive-leaping-elephant.md, "Tournoi Wrapped") for
 * the reasoning behind the rating replay and the champion-detection split
 * between knockout and pools-only categories.
 */
@Injectable()
export class WrappedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly standingsService: StandingsService,
    private readonly ratingsService: RatingsService,
  ) {}

  async getWrapped(slug: string): Promise<TournamentWrapped> {
    const tournament = await this.tournamentsService.getPublicBySlug(slug);
    const unlocked = await this.tournamentsService.hasPremiumFeatures(
      tournament.organizationId,
      tournament.tournamentId,
    );
    if (!unlocked) {
      return { unlocked: false };
    }

    const tournamentMatchWhere = {
      OR: [
        {
          group: {
            phase: { category: { tournamentId: tournament.tournamentId } },
          },
        },
        {
          knockoutBracket: {
            phase: { category: { tournamentId: tournament.tournamentId } },
          },
        },
      ],
    };

    const [teamsCount, groupsCount, categories, matches] = await Promise.all([
      this.prisma.team.count({
        where: { tournamentId: tournament.tournamentId },
      }),
      this.prisma.group.count({
        where: {
          phase: { category: { tournamentId: tournament.tournamentId } },
        },
      }),
      this.prisma.category.findMany({
        where: { tournamentId: tournament.tournamentId },
        select: {
          id: true,
          name: true,
          phases: {
            select: {
              type: true,
              isSeedPhase: true,
              knockoutBracket: { select: { id: true, size: true } },
              groups: { select: { id: true } },
            },
          },
        },
      }),
      this.prisma.match.findMany({
        where: tournamentMatchWhere,
        select: {
          id: true,
          round: true,
          isThirdPlaceMatch: true,
          knockoutBracketId: true,
          homeTeamId: true,
          awayTeamId: true,
          forfeitedTeamId: true,
          status: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          timeSlot: {
            select: { startTime: true, field: { select: { name: true } } },
          },
          officials: { select: { refereeId: true } },
          score: {
            select: {
              homeScore: true,
              awayScore: true,
              homePenaltyScore: true,
              awayPenaltyScore: true,
              isValidated: true,
              validatedAt: true,
            },
          },
        },
      }),
    ]);

    const validatedMatches = matches.filter(
      (match) => match.score?.isValidated,
    );

    const refereeIds = new Set<string>();
    for (const match of matches) {
      for (const official of match.officials) {
        if (official.refereeId) {
          refereeIds.add(official.refereeId);
        }
      }
    }
    const venueNames = new Set(
      matches
        .map((match) => match.timeSlot?.field?.name)
        .filter((name): name is string => Boolean(name)),
    );

    const matchStatsInput: WrappedMatchInput[] = validatedMatches.map(
      (match) => ({
        id: match.id,
        homeTeamName: match.homeTeam?.name ?? null,
        awayTeamName: match.awayTeam?.name ?? null,
        homeScore: match.score!.homeScore,
        awayScore: match.score!.awayScore,
        homePenaltyScore: match.score!.homePenaltyScore,
        awayPenaltyScore: match.score!.awayPenaltyScore,
        fieldName: match.timeSlot?.field?.name ?? null,
        startTime: match.timeSlot?.startTime ?? null,
      }),
    );
    const matchStats = computeMatchStats(matchStatsInput);

    // Crowning a champion while other matches are still to be played reads
    // as a wrong/premature result -- so the whole champions list stays
    // empty until every match has reached a final state (a decided winner,
    // or one that will never be played).
    const allMatchesDecided =
      matches.length > 0 &&
      matches.every(
        (match) =>
          match.status === 'CANCELLED' ||
          match.status === 'FORFEITED' ||
          (match.status === 'COMPLETED' && match.score?.isValidated === true),
      );

    const champions: {
      categoryId: string;
      categoryName: string;
      teamName: string;
    }[] = [];
    if (allMatchesDecided) {
      for (const category of categories) {
        const knockoutPhase = category.phases.find(
          (phase) =>
            phase.type === 'KNOCKOUT' &&
            !phase.isSeedPhase &&
            phase.knockoutBracket,
        );
        if (knockoutPhase?.knockoutBracket) {
          const totalRounds = Math.log2(knockoutPhase.knockoutBracket.size);
          const final = validatedMatches.find(
            (match) =>
              match.knockoutBracketId === knockoutPhase.knockoutBracket!.id &&
              match.round === totalRounds &&
              !match.isThirdPlaceMatch,
          );
          const winnerId = final ? getWinnerTeamId(final) : null;
          const winnerName =
            winnerId && final
              ? winnerId === final.homeTeamId
                ? final.homeTeam?.name
                : final.awayTeam?.name
              : null;
          if (winnerName) {
            champions.push({
              categoryId: category.id,
              categoryName: category.name,
              teamName: winnerName,
            });
          }
          continue;
        }
        // Pools-only category: a single pool's rank 1 is an unambiguous
        // champion; several pools with no knockout phase have no one natural
        // winner to crown, so they're skipped rather than guessed at.
        const poolPhase = category.phases.find(
          (phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase,
        );
        if (poolPhase && poolPhase.groups.length === 1) {
          const { rows } = await this.standingsService.getStandings(
            tournament.organizationId,
            tournament.tournamentId,
            poolPhase.groups[0].id,
          );
          const winner = rows.find((row) => row.position === 1);
          if (winner) {
            champions.push({
              categoryId: category.id,
              categoryName: category.name,
              teamName: winner.teamName,
            });
          }
        }
      }
    }

    // Champions' *current* level reuses the live TeamRating table directly
    // (no replay needed — only the historical "rating just before a specific
    // past match" below needs one).
    const championRatings = await this.ratingsService.getRatingsForTeamNames(
      tournament.organizationId,
      champions.map((champion) => champion.teamName),
    );

    const biggestUpset = await this.findBiggestUpset(
      tournament.organizationId,
      validatedMatches,
    );

    return {
      unlocked: true,
      organisation: {
        teamsCount,
        categoriesCount: categories.length,
        groupsCount,
        venuesCount: venueNames.size,
        refereesCount: refereeIds.size,
        startDate: tournament.startDate,
        endDate: tournament.endDate,
      },
      goals: {
        totalGoals: matchStats.totalGoals,
        averageGoalsPerMatch: matchStats.averageGoalsPerMatch,
        matchesPlayed: matchStats.matchesPlayed,
        highestScoringMatch: matchStats.highestScoringMatch,
        biggestWinMargin: matchStats.biggestWinMargin,
        closestMatch: matchStats.closestMatch,
      },
      outcomes: matchStats.outcomes,
      venues: matchStats.venues,
      matchesByHour: matchStats.matchesByHour,
      topAttack: matchStats.topAttack,
      topDefense: matchStats.topDefense,
      level: {
        champions: champions.map((champion) => ({
          ...champion,
          rating: championRatings.get(champion.teamName)?.rating ?? 1500,
        })),
        biggestUpset,
      },
    };
  }

  /**
   * See wrapped.util.ts's findBiggestUpset doc comment for the full
   * reasoning — this just owns the Prisma query (every validated match, for
   * every team that appears in this tournament, across the WHOLE
   * organization, chronologically by MatchScore.validatedAt) that the pure
   * replay function needs.
   */
  private async findBiggestUpset(
    organizationId: string,
    validatedMatches: {
      id: string;
      homeTeam: { name: string } | null;
      awayTeam: { name: string } | null;
    }[],
  ) {
    const teamNames = [
      ...new Set(
        validatedMatches
          .flatMap((match) => [match.homeTeam?.name, match.awayTeam?.name])
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    if (teamNames.length === 0) {
      return null;
    }
    const inScopeMatchIds = new Set(validatedMatches.map((match) => match.id));

    const history = await this.prisma.match.findMany({
      where: {
        score: { isValidated: true },
        OR: [
          {
            homeTeam: {
              name: { in: teamNames },
              tournament: { organizationId },
            },
          },
          {
            awayTeam: {
              name: { in: teamNames },
              tournament: { organizationId },
            },
          },
        ],
      },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        forfeitedTeamId: true,
        status: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        score: {
          select: {
            homeScore: true,
            awayScore: true,
            homePenaltyScore: true,
            awayPenaltyScore: true,
            isValidated: true,
            validatedAt: true,
          },
        },
      },
      orderBy: { score: { validatedAt: 'asc' } },
    });

    const entries: RatingHistoryEntry[] = history
      .filter((match) => match.homeTeam && match.awayTeam)
      .map((match) => ({
        matchId: match.id,
        homeTeamName: match.homeTeam!.name,
        awayTeamName: match.awayTeam!.name,
        outcome: match,
        inScope: inScopeMatchIds.has(match.id),
      }));

    return findBiggestUpset(entries);
  }
}
