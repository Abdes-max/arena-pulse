import { isPowerOfTwo, seedOrder } from './bracket-seeding.util';

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
