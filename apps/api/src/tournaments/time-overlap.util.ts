/** Half-open interval overlap check: touching boundaries (aEnd === bStart) do not count as overlapping. */
export function timeRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
