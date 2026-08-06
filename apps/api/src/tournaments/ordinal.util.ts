// Small, self-contained French ordinal/round-name helpers for building
// placeholder labels (e.g. "1er Poule A", "Vainqueur Quart de finale 1")
// server-side. Deliberately duplicated from libs/shared-models/src/lib/
// round-label.util.ts's ORDINAL_WORD table rather than imported -- apps/api
// has no existing dependency on libs/ (no tsconfig path, no build-order
// wiring), and importing an Angular-built library into the NestJS app would
// be new, unproven cross-app plumbing for ~20 lines of logic.

/** "1er", "2e", "3e"... -- for a team's standing position (never "1e"). */
export function ordinal(position: number): string {
  return position === 1 ? '1er' : `${position}e`;
}

const ROUND_WORD: Record<number, string> = {
  1: 'Demi',
  2: 'Quart',
  3: 'Huitième',
  4: 'Seizième',
  5: 'Trente-deuxième',
  6: 'Soixante-quatrième',
};

/**
 * French name for a knockout round, by distance from the final (fromEnd = 0
 * is the final itself, 1 = semifinals, 2 = quarterfinals...). Mirrors
 * libs/shared-models/src/lib/round-label.util.ts's roundLabel exactly, kept
 * in sync by hand since the two can't share code (see file header).
 */
export function roundLabel(fromEnd: number): string {
  if (fromEnd <= 0) {
    return 'Finale';
  }
  if (fromEnd === 1) {
    return 'Demi-finale';
  }
  const word = ROUND_WORD[fromEnd] ?? `1/${2 ** fromEnd}`;
  return `${word} de finale`;
}
