import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_RATING,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
  GlickoPlayer,
  updateGlicko2,
} from './glicko2.util';
import { getWinnerTeamId, MatchOutcomeInput } from './match-outcome.util';

export interface MatchForRating extends MatchOutcomeInput {
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
}

export interface TeamRatingSummary {
  rating: number;
  ratingDeviation: number;
  matchesPlayed: number;
}

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies a Glicko-2 update to both teams from a completed (scored or
   * forfeited) match. No-op for placeholder matches (either team not yet
   * known) -- can't happen at the real call sites (validateScore /
   * declareForfeit both require an existing match with both teams
   * assigned), kept defensive to match the rest of the codebase's style.
   */
  async recordMatchResult(
    organizationId: string,
    match: MatchForRating,
  ): Promise<void> {
    if (!match.homeTeam || !match.awayTeam) {
      return;
    }
    const winnerTeamId = getWinnerTeamId(match);
    const homeScore = resolveScore(winnerTeamId, match.homeTeam.id);
    const awayScore = resolveScore(winnerTeamId, match.awayTeam.id);

    const [homeRating, awayRating] = await Promise.all([
      this.findOrCreateRating(organizationId, match.homeTeam.name),
      this.findOrCreateRating(organizationId, match.awayTeam.name),
    ]);

    // Snapshot both pre-match ratings before computing either update: each
    // side's new rating must be derived from the opponent's pre-match
    // value, never from a value already mutated by this same match.
    const homeSnapshot: GlickoPlayer = {
      rating: homeRating.rating,
      ratingDeviation: homeRating.ratingDeviation,
      volatility: homeRating.volatility,
    };
    const awaySnapshot: GlickoPlayer = {
      rating: awayRating.rating,
      ratingDeviation: awayRating.ratingDeviation,
      volatility: awayRating.volatility,
    };

    const homeUpdated = updateGlicko2(homeSnapshot, [
      { opponent: awaySnapshot, score: homeScore },
    ]);
    const awayUpdated = updateGlicko2(awaySnapshot, [
      { opponent: homeSnapshot, score: awayScore },
    ]);

    await Promise.all([
      this.prisma.teamRating.update({
        where: { id: homeRating.id },
        data: { ...homeUpdated, matchesPlayed: { increment: 1 } },
      }),
      this.prisma.teamRating.update({
        where: { id: awayRating.id },
        data: { ...awayUpdated, matchesPlayed: { increment: 1 } },
      }),
    ]);
  }

  /** Pure read -- never creates rows; unmatched names get the default rating. */
  async getRatingsForTeamNames(
    organizationId: string,
    teamNames: string[],
  ): Promise<Map<string, TeamRatingSummary>> {
    const uniqueNames = [...new Set(teamNames)];
    const rows = await this.prisma.teamRating.findMany({
      where: { organizationId, teamName: { in: uniqueNames } },
    });
    const rowByName = new Map(rows.map((row) => [row.teamName, row]));

    const result = new Map<string, TeamRatingSummary>();
    for (const name of uniqueNames) {
      const row = rowByName.get(name);
      result.set(name, {
        rating: row?.rating ?? DEFAULT_RATING,
        ratingDeviation: row?.ratingDeviation ?? DEFAULT_RATING_DEVIATION,
        matchesPlayed: row?.matchesPlayed ?? 0,
      });
    }
    return result;
  }

  private findOrCreateRating(organizationId: string, teamName: string) {
    return this.prisma.teamRating.upsert({
      where: { organizationId_teamName: { organizationId, teamName } },
      update: {},
      create: {
        organizationId,
        teamName,
        rating: DEFAULT_RATING,
        ratingDeviation: DEFAULT_RATING_DEVIATION,
        volatility: DEFAULT_VOLATILITY,
      },
    });
  }
}

function resolveScore(
  winnerTeamId: string | null,
  teamId: string,
): 0 | 0.5 | 1 {
  if (winnerTeamId === null) {
    return 0.5;
  }
  return winnerTeamId === teamId ? 1 : 0;
}
