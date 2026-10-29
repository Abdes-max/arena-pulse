// Quick event "phase finale": a classic single-elimination bracket fed by the
// pools. Duplicated in apps/web/src/app/admin/shared/plateau-preview.ts and
// apps/mobile/src/app/organizer/core/plateau-preview.ts -- keep in sync.

export const KNOCKOUT_SIZES = [2, 4, 8, 16, 32] as const;

export interface KnockoutQualification {
  /** Teams in the bracket (2 = final, 4 = semi-finals...). */
  size: number;
  /** Teams qualified directly from every pool (positions 1..qualifiersPerPool). */
  qualifiersPerPool: number;
  /** Best teams at the next position, across pools, to fill the bracket. */
  bestOfPosition: { position: number; bestCount: number } | null;
}

/**
 * How `size` bracket spots are filled from `poolCount` pools of `teamCount`
 * teams (balanced split), or null when it can't be: e.g. 3 pools -> a
 * 4-team bracket takes the 3 winners + the best runner-up.
 */
export function knockoutQualification(
  size: number,
  teamCount: number,
  poolCount: number,
): KnockoutQualification | null {
  if (
    !(KNOCKOUT_SIZES as readonly number[]).includes(size) ||
    size > teamCount
  ) {
    return null;
  }
  const qualifiersPerPool = Math.floor(size / poolCount);
  const bestCount = size % poolCount;
  const smallestPool = Math.floor(teamCount / poolCount);
  if (
    qualifiersPerPool < 1 ||
    qualifiersPerPool + (bestCount > 0 ? 1 : 0) > smallestPool
  ) {
    return null;
  }
  return {
    size,
    qualifiersPerPool,
    bestOfPosition:
      bestCount > 0 ? { position: qualifiersPerPool + 1, bestCount } : null,
  };
}

/** Every bracket size the quick event form can offer for this split. */
export function knockoutSizesFor(
  teamCount: number,
  poolCount: number,
): number[] {
  return KNOCKOUT_SIZES.filter(
    (size) => knockoutQualification(size, teamCount, poolCount) !== null,
  );
}
