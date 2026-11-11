import {
  isPowerOfTwo,
  seedOrder,
  firstRoundPairing,
  isValidFirstRoundOrder,
} from './bracket-seeding.util';

describe('seedOrder', () => {
  it('returns the standard 4-team seeding', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it('returns the standard 8-team seeding', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('returns the standard 16-team seeding', () => {
    expect(seedOrder(16)).toEqual([
      1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11,
    ]);
  });

  it('handles the trivial 2-team case', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
  });
});

describe('isPowerOfTwo', () => {
  it.each([2, 4, 8, 16, 32])('accepts %d', (size) => {
    expect(isPowerOfTwo(size)).toBe(true);
  });

  it.each([0, 1, 3, 5, 6, 7, 12])('rejects %d', (size) => {
    expect(isPowerOfTwo(size)).toBe(false);
  });
});

describe('firstRoundPairing', () => {
  it('uses the standard seeding when nothing is saved', () => {
    expect(firstRoundPairing({ size: 4, firstRoundOrder: null })).toEqual([
      1, 4, 2, 3,
    ]);
  });

  it("uses the organizer's pairing, 1-based", () => {
    // 1st A vs 2nd A, 1st B vs 2nd B (qualifiers: 1A, 1B, 2A, 2B)
    expect(
      firstRoundPairing({ size: 4, firstRoundOrder: [0, 2, 1, 3] }),
    ).toEqual([1, 3, 2, 4]);
  });

  it('falls back to the standard seeding when the saved pairing no longer fits', () => {
    expect(
      firstRoundPairing({ size: 8, firstRoundOrder: [0, 2, 1, 3] }),
    ).toEqual(firstRoundPairing({ size: 8 }));
  });
});

describe('isValidFirstRoundOrder', () => {
  it('needs every qualifier exactly once', () => {
    expect(isValidFirstRoundOrder([0, 1, 2, 3], 4)).toBe(true);
    expect(isValidFirstRoundOrder([0, 0, 2, 3], 4)).toBe(false);
    expect(isValidFirstRoundOrder([0, 1, 2, 4], 4)).toBe(false);
    expect(isValidFirstRoundOrder([0, 1, 2], 4)).toBe(false);
    expect(isValidFirstRoundOrder(null, 4)).toBe(false);
  });
});
