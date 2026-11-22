// Game formats offered when creating a tournament, by sport (the sport's
// name, lower-cased and without accents). Stored as the tournament's
// `format`, so they read the same on every public page and on the poster.
const GAME_FORMATS: Record<string, readonly string[]> = {
  football: ['4 vs 4', '5 vs 5', '8 vs 8', '11 vs 11'],
  futsal: ['5 vs 5'],
  basketball: ['3x3', '5 vs 5'],
  handball: ['4 vs 4', '7 vs 7'],
  volleyball: ['2 vs 2', '4 vs 4', '6 vs 6'],
  rugby: ['Rugby à 5', 'Rugby à 7', 'Rugby à 10', 'Rugby à 13', 'Rugby à 15'],
  tennis: ['Simple', 'Double', 'Double mixte'],
  badminton: ['Simple', 'Double', 'Double mixte'],
  padel: ['Double', 'Double mixte'],
  esport: ['1 vs 1', '2 vs 2', '3 vs 3', '5 vs 5'],
};

// A sport missing from the list above.
const OTHER_FORMATS = ['1 vs 1', '2 vs 2', '3 vs 3', '5 vs 5'] as const;

function sportKey(sportName: string): string {
  return sportName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** The formats to pick from for this sport. */
export function gameFormatsFor(sportName: string | null | undefined): readonly string[] {
  return GAME_FORMATS[sportKey(sportName ?? '')] ?? OTHER_FORMATS;
}

/**
 * The format preselected for this sport and category: for youth football,
 * the size French clubs play at that age (U6-U7 4 vs 4, U8-U9 5 vs 5,
 * U10-U13 8 vs 8, then 11 vs 11); the sport's first format otherwise.
 */
export function defaultGameFormat(
  sportName: string | null | undefined,
  categoryName?: string | null,
): string {
  const formats = gameFormatsFor(sportName);
  if (sportKey(sportName ?? '') === 'football') {
    const age = Number(/^U(\d+)$/i.exec(categoryName?.trim() ?? '')?.[1]);
    if (age) {
      return age <= 7 ? '4 vs 4' : age <= 9 ? '5 vs 5' : age <= 13 ? '8 vs 8' : '11 vs 11';
    }
    return '11 vs 11';
  }
  return formats[0];
}
