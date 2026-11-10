export interface SetScore {
  home: number;
  away: number;
}

export type ScoreFormatKind = 'GOALS' | 'SETS';

export interface ScoringConfig {
  format: ScoreFormatKind;
  /** Sets a side must win to take the match; meaningful for SETS only. */
  setsToWin: number;
}

interface ScoringSource {
  phaseSetsToWin: number | null;
  sport: { scoreFormat: ScoreFormatKind; defaultSetsToWin: number | null };
}

/** The phase's own setsToWin wins over the sport's default (best of 3 in pools, best of 5 in the final). */
export function resolveScoring({
  phaseSetsToWin,
  sport,
}: ScoringSource): ScoringConfig {
  return {
    format: sport.scoreFormat,
    setsToWin: phaseSetsToWin ?? sport.defaultSetsToWin ?? 2,
  };
}

/** Sets won by each side. A tied set (still being played) counts for nobody. */
export function countSetsWon(sets: SetScore[]): {
  home: number;
  away: number;
} {
  let home = 0;
  let away = 0;
  for (const set of sets) {
    if (set.home > set.away) home++;
    else if (set.away > set.home) away++;
  }
  return { home, away };
}

/**
 * Checks the shape of a sets score and returns the sets won by each side
 * (what MatchScore.homeScore/awayScore hold in SETS mode).
 *
 * `complete: false` accepts a match in progress (nobody has reached
 * setsToWin yet, the last set may be tied); `complete: true` is the final
 * result: no tied set, exactly one side at setsToWin, nothing played after.
 * Returns an error message instead of throwing so callers pick the exception.
 */
export function checkSets(
  sets: SetScore[],
  setsToWin: number,
  complete: boolean,
): { home: number; away: number } | { error: string } {
  const maxSets = 2 * setsToWin - 1;
  if (sets.length > maxSets) {
    return {
      error: `Au plus ${maxSets} sets pour un match en ${setsToWin} sets gagnants.`,
    };
  }
  let home = 0;
  let away = 0;
  for (const [index, set] of sets.entries()) {
    if (home === setsToWin || away === setsToWin) {
      return { error: 'Aucun set ne peut être joué après la fin du match.' };
    }
    if (set.home === set.away) {
      if (complete || index < sets.length - 1) {
        return { error: `Le set ${index + 1} ne peut pas être à égalité.` };
      }
    } else if (set.home > set.away) {
      home++;
    } else {
      away++;
    }
  }
  if (complete && home !== setsToWin && away !== setsToWin) {
    return {
      error: `Un côté doit gagner ${setsToWin} sets pour terminer le match.`,
    };
  }
  return { home, away };
}
