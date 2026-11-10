export const TIE_BREAK_CRITERIA = [
  'POINTS',
  'GOAL_DIFFERENCE',
  'GOALS_SCORED',
  'HEAD_TO_HEAD',
  // SETS format (padel, tennis, volleyball, badminton).
  'SET_DIFFERENCE',
  'GAME_DIFFERENCE',
  'SETS_WON',
] as const;

export const DEFAULT_TIE_BREAK_ORDER: string[] = [
  'POINTS',
  'GOAL_DIFFERENCE',
  'GOALS_SCORED',
  'HEAD_TO_HEAD',
];

interface SportScoring {
  scoreFormat: 'GOALS' | 'SETS';
  defaultSetsToWin: number | null;
}

/**
 * What a new StandingRule starts with for this sport. Sets sports rank on
 * match points, head to head, then sets and games; a best-of-5 sport
 * (volleyball) also starts with the usual 2/1 points for a match that went
 * to the deciding set.
 */
export function standingRuleDefaults(sport: SportScoring | null): {
  tieBreakOrder: string[];
  decidingSetWinPoints?: number;
  decidingSetLossPoints?: number;
} {
  if (sport?.scoreFormat !== 'SETS') {
    return { tieBreakOrder: DEFAULT_TIE_BREAK_ORDER };
  }
  return {
    tieBreakOrder: DEFAULT_SETS_TIE_BREAK_ORDER,
    ...((sport.defaultSetsToWin ?? 0) >= 3 && {
      decidingSetWinPoints: 2,
      decidingSetLossPoints: 1,
    }),
  };
}

// Sets/games sports: match points, then head to head, then sets and games.
export const DEFAULT_SETS_TIE_BREAK_ORDER: string[] = [
  'POINTS',
  'HEAD_TO_HEAD',
  'SET_DIFFERENCE',
  'GAME_DIFFERENCE',
];
