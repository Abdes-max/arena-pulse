export const TIE_BREAK_CRITERIA = [
  'POINTS',
  'GOAL_DIFFERENCE',
  'GOALS_SCORED',
  'HEAD_TO_HEAD',
] as const;

export const DEFAULT_TIE_BREAK_ORDER: string[] = [
  'POINTS',
  'GOAL_DIFFERENCE',
  'GOALS_SCORED',
  'HEAD_TO_HEAD',
];
