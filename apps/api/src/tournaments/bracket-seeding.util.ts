/**
 * Standard single-elimination seeding order (as used by e.g. NCAA brackets):
 * top seeds are kept as far apart as possible for as long as possible.
 * `size` must be a power of two. Round-1 pairs are consecutive entries:
 * seedOrder(8) => [1,8,4,5,2,7,3,6] pairs as (1v8),(4v5),(2v7),(3v6).
 */
export function seedOrder(size: number): number[] {
  let seeds = [1];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const seed of seeds) {
      next.push(seed, sum - seed);
    }
    seeds = next;
  }
  return seeds;
}

export function isPowerOfTwo(size: number): boolean {
  return size >= 2 && (size & (size - 1)) === 0;
}

/** True when `order` lists each of 0..size-1 exactly once. */
export function isValidFirstRoundOrder(
  order: unknown,
  size: number,
): order is number[] {
  return (
    Array.isArray(order) &&
    order.length === size &&
    order.every((value) => Number.isInteger(value)) &&
    new Set(order).size === size &&
    (order as number[]).every((value) => value >= 0 && value < size)
  );
}

/**
 * Who meets whom in round 1, as 1-based qualifier numbers in the same shape as
 * seedOrder (positions 2k and 2k+1 play match k): the organizer's own pairing
 * when one is saved and still fits the bracket, the standard seeding otherwise.
 */
export function firstRoundPairing(bracket: {
  size: number;
  firstRoundOrder?: unknown;
}): number[] {
  return isValidFirstRoundOrder(bracket.firstRoundOrder, bracket.size)
    ? bracket.firstRoundOrder.map((index) => index + 1)
    : seedOrder(bracket.size);
}
