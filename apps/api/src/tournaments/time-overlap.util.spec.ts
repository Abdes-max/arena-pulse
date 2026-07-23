import { timeRangesOverlap } from './time-overlap.util';

function at(minutes: number): Date {
  return new Date(2026, 0, 1, 9, minutes);
}

describe('timeRangesOverlap', () => {
  it('returns false when ranges only touch at the boundary', () => {
    expect(timeRangesOverlap(at(0), at(20), at(20), at(40))).toBe(false);
    expect(timeRangesOverlap(at(20), at(40), at(0), at(20))).toBe(false);
  });

  it('returns true for a partial overlap', () => {
    expect(timeRangesOverlap(at(0), at(20), at(10), at(30))).toBe(true);
    expect(timeRangesOverlap(at(10), at(30), at(0), at(20))).toBe(true);
  });

  it('returns true when one range fully contains the other', () => {
    expect(timeRangesOverlap(at(0), at(60), at(10), at(20))).toBe(true);
    expect(timeRangesOverlap(at(10), at(20), at(0), at(60))).toBe(true);
  });

  it('returns false for entirely disjoint ranges', () => {
    expect(timeRangesOverlap(at(0), at(20), at(30), at(50))).toBe(false);
  });

  it('returns true for identical ranges', () => {
    expect(timeRangesOverlap(at(0), at(20), at(0), at(20))).toBe(true);
  });
});
