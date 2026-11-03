// Pure helpers behind the public "Tournoi Wrapped" recap
// (GET /public/tournaments/:slug/wrapped, see wrapped.service.ts) — no
// Prisma/IO here, only plain data in/out, so every rule below is testable
// in isolation (wrapped.util.spec.ts) the same way glicko2.util.ts and
// standings.util.ts already are.
import { getWinnerTeamId, MatchOutcomeInput } from './match-outcome.util';
import {
  DEFAULT_RATING,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
  GlickoPlayer,
  updateGlicko2,
} from './glicko2.util';

/** A grassroots team's very first counted match still needs 3+ games before
 * "fewest goals conceded" means anything — otherwise a team that played (and
 * won) a single match 1-0 would always top the defense ranking. */
export const MIN_MATCHES_FOR_DEFENSE_RANKING = 3;

export interface WrappedMatchInput {
  id: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number;
  awayScore: number;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  fieldName: string | null;
  startTime: Date | null;
}

export interface MatchHighlight {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface TeamGoalTally {
  teamName: string;
  goals: number;
  matchesPlayed: number;
}

export interface MatchOutcomeBreakdown {
  homeWin: number;
  awayWin: number;
  draw: number;
  shootout: number;
}

export interface WrappedMatchStats {
  matchesPlayed: number;
  totalGoals: number;
  averageGoalsPerMatch: number;
  highestScoringMatch: MatchHighlight | null;
  biggestWinMargin: MatchHighlight | null;
  closestMatch: MatchHighlight | null;
  outcomes: MatchOutcomeBreakdown;
  venues: NamedCount[];
  matchesByHour: NamedCount[];
  topAttack: TeamGoalTally[];
  topDefense: TeamGoalTally[];
}

/**
 * Aggregates every "raw" (non-rating) Wrapped stat from a tournament's
 * validated matches — one pass, plain arithmetic, no external state. Matches
 * missing a team name (an unresolved knockout placeholder can't happen here
 * in practice, since only *validated* matches are ever passed in, but is
 * skipped defensively rather than assumed away) are ignored everywhere.
 */
export function computeMatchStats(
  matches: WrappedMatchInput[],
): WrappedMatchStats {
  const played = matches.filter(
    (match) => match.homeTeamName && match.awayTeamName,
  );
  const totalGoals = played.reduce(
    (sum, m) => sum + m.homeScore + m.awayScore,
    0,
  );

  const outcomes: MatchOutcomeBreakdown = {
    homeWin: 0,
    awayWin: 0,
    draw: 0,
    shootout: 0,
  };
  const venueCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();
  const goalsFor = new Map<string, number>();
  const goalsAgainst = new Map<string, number>();
  const matchesPlayedByTeam = new Map<string, number>();

  let highestScoringMatch: MatchHighlight | null = null;
  let biggestWinMargin: MatchHighlight | null = null;
  let closestMatch: MatchHighlight | null = null;
  let closestMargin = Infinity;
  let highestTotal = -1;
  let biggestMargin = -1;

  for (const match of played) {
    const home = match.homeTeamName as string;
    const away = match.awayTeamName as string;
    const highlight: MatchHighlight = {
      matchId: match.id,
      homeTeamName: home,
      awayTeamName: away,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homePenaltyScore: match.homePenaltyScore,
      awayPenaltyScore: match.awayPenaltyScore,
    };

    const total = match.homeScore + match.awayScore;
    if (total > highestTotal) {
      highestTotal = total;
      highestScoringMatch = highlight;
    }

    goalsFor.set(home, (goalsFor.get(home) ?? 0) + match.homeScore);
    goalsFor.set(away, (goalsFor.get(away) ?? 0) + match.awayScore);
    goalsAgainst.set(home, (goalsAgainst.get(home) ?? 0) + match.awayScore);
    goalsAgainst.set(away, (goalsAgainst.get(away) ?? 0) + match.homeScore);
    matchesPlayedByTeam.set(home, (matchesPlayedByTeam.get(home) ?? 0) + 1);
    matchesPlayedByTeam.set(away, (matchesPlayedByTeam.get(away) ?? 0) + 1);

    if (match.fieldName) {
      venueCounts.set(
        match.fieldName,
        (venueCounts.get(match.fieldName) ?? 0) + 1,
      );
    }
    if (match.startTime) {
      // UTC, not server-local time: the recap must bucket the same way
      // regardless of which timezone the API process happens to run in.
      const hour = match.startTime.getUTCHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }

    const margin = Math.abs(match.homeScore - match.awayScore);
    const decidedByShootout =
      margin === 0 &&
      match.homePenaltyScore !== null &&
      match.awayPenaltyScore !== null &&
      match.homePenaltyScore !== match.awayPenaltyScore;

    if (margin === 0 && !decidedByShootout) {
      outcomes.draw += 1;
    } else if (decidedByShootout) {
      outcomes.shootout += 1;
    } else if (match.homeScore > match.awayScore) {
      outcomes.homeWin += 1;
    } else {
      outcomes.awayWin += 1;
    }

    // "Closest match" only makes sense among *decided* matches — a plain
    // draw has no winner to have nearly lost.
    if (margin > 0 || decidedByShootout) {
      const rankedMargin = decidedByShootout ? 0 : margin;
      if (rankedMargin < closestMargin) {
        closestMargin = rankedMargin;
        closestMatch = highlight;
      }
      if (!decidedByShootout && margin > biggestMargin) {
        biggestMargin = margin;
        biggestWinMargin = highlight;
      }
    }
  }

  const topAttack = [...goalsFor.entries()]
    .map(([teamName, goals]): TeamGoalTally => ({
      teamName,
      goals,
      matchesPlayed: matchesPlayedByTeam.get(teamName) ?? 0,
    }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 5);

  const topDefense = [...goalsAgainst.entries()]
    .map(([teamName, goals]): TeamGoalTally => ({
      teamName,
      goals,
      matchesPlayed: matchesPlayedByTeam.get(teamName) ?? 0,
    }))
    .filter((row) => row.matchesPlayed >= MIN_MATCHES_FOR_DEFENSE_RANKING)
    .sort((a, b) => a.goals - b.goals)
    .slice(0, 5);

  return {
    matchesPlayed: played.length,
    totalGoals,
    averageGoalsPerMatch: played.length > 0 ? totalGoals / played.length : 0,
    highestScoringMatch,
    biggestWinMargin,
    closestMatch,
    outcomes,
    venues: [...venueCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    matchesByHour: [...hourCounts.entries()]
      .map(([hour, count]) => ({ name: String(hour), count }))
      .sort((a, b) => Number(a.name) - Number(b.name)),
    topAttack,
    topDefense,
  };
}

// --- Rating replay (biggest upset) -----------------------------------------

/**
 * One validated match, anywhere in the organization's history, in the exact
 * chronological order RatingsService.recordMatchResult already applied it in
 * production (MatchScore.validatedAt) — the only thing that makes the replay
 * below reproduce real historical ratings instead of guessing at them.
 */
export interface RatingHistoryEntry {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  outcome: MatchOutcomeInput;
  /** True for a match that belongs to the tournament this Wrapped is for. */
  inScope: boolean;
}

export interface BiggestUpset {
  matchId: string;
  winnerTeamName: string;
  loserTeamName: string;
  winnerRatingBefore: number;
  loserRatingBefore: number;
  gap: number;
}

function outcomeScore(
  outcome: MatchOutcomeInput,
  teamId: string | null,
): 0 | 0.5 | 1 {
  const winnerTeamId = getWinnerTeamId(outcome);
  if (winnerTeamId === null) {
    return 0.5;
  }
  return winnerTeamId === teamId ? 1 : 0;
}

/**
 * Replays every one of the involved teams' validated matches, across their
 * whole organization history (TeamRating has no per-tournament reset — see
 * this feature's plan doc for why), applying the exact same Glicko-2 update
 * as RatingsService.recordMatchResult. While replaying, whenever a match
 * `inScope` is reached, its *pre-match* ratings are known and compared: the
 * biggest upset is the in-scope match with a decided winner whose winner was
 * rated lower than the loser, by the widest margin. Returns null if no
 * in-scope match was ever an upset (favourite always won, or no decided
 * match exists at all).
 *
 * `history` must already be sorted ascending by validatedAt — the caller
 * owns the Prisma query, this function only owns the math.
 */
export function findBiggestUpset(
  history: RatingHistoryEntry[],
): BiggestUpset | null {
  const ratings = new Map<string, GlickoPlayer>();
  const getOrCreate = (teamName: string): GlickoPlayer =>
    ratings.get(teamName) ?? {
      rating: DEFAULT_RATING,
      ratingDeviation: DEFAULT_RATING_DEVIATION,
      volatility: DEFAULT_VOLATILITY,
    };

  let best: BiggestUpset | null = null;

  for (const entry of history) {
    const homeBefore = getOrCreate(entry.homeTeamName);
    const awayBefore = getOrCreate(entry.awayTeamName);

    if (entry.inScope) {
      const winnerTeamId = getWinnerTeamId(entry.outcome);
      const winnerIsHome =
        winnerTeamId !== null && winnerTeamId === entry.outcome.homeTeamId;
      const winnerName =
        winnerTeamId === null
          ? null
          : winnerIsHome
            ? entry.homeTeamName
            : entry.awayTeamName;
      const loserName =
        winnerTeamId === null
          ? null
          : winnerIsHome
            ? entry.awayTeamName
            : entry.homeTeamName;
      const winnerRatingBefore = winnerIsHome
        ? homeBefore.rating
        : awayBefore.rating;
      const loserRatingBefore = winnerIsHome
        ? awayBefore.rating
        : homeBefore.rating;
      const gap = loserRatingBefore - winnerRatingBefore;

      if (winnerName && loserName && gap > 0 && (!best || gap > best.gap)) {
        best = {
          matchId: entry.matchId,
          winnerTeamName: winnerName,
          loserTeamName: loserName,
          winnerRatingBefore,
          loserRatingBefore,
          gap,
        };
      }
    }

    const homeScore = outcomeScore(entry.outcome, entry.outcome.homeTeamId);
    const awayScore = outcomeScore(entry.outcome, entry.outcome.awayTeamId);
    ratings.set(
      entry.homeTeamName,
      updateGlicko2(homeBefore, [{ opponent: awayBefore, score: homeScore }]),
    );
    ratings.set(
      entry.awayTeamName,
      updateGlicko2(awayBefore, [{ opponent: homeBefore, score: awayScore }]),
    );
  }

  return best;
}
