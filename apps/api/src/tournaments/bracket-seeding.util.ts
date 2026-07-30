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
