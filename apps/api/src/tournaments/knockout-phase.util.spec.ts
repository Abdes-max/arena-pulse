import { knockoutQualification, knockoutSizesFor } from './knockout-phase.util';

describe('knockoutQualification', () => {
  it('takes the top 2 of a single pool for a final', () => {
    expect(knockoutQualification(2, 5, 1)).toEqual({
      size: 2,
      qualifiersPerPool: 2,
      bestOfPosition: null,
    });
  });

  it('takes the 2 best of each of 2 pools for semi-finals', () => {
    expect(knockoutQualification(4, 8, 2)).toEqual({
      size: 4,
      qualifiersPerPool: 2,
      bestOfPosition: null,
    });
  });

  it('completes the bracket with the best runners-up when pools do not divide it', () => {
    expect(knockoutQualification(4, 9, 3)).toEqual({
      size: 4,
      qualifiersPerPool: 1,
      bestOfPosition: { position: 2, bestCount: 1 },
    });
  });

  it('rejects a bracket larger than the pools can feed', () => {
    expect(knockoutQualification(8, 6, 2)).toBeNull();
    expect(knockoutQualification(4, 3, 1)).toBeNull();
    expect(knockoutQualification(2, 12, 4)).toBeNull();
    expect(knockoutQualification(6, 12, 2)).toBeNull();
  });
});

describe('knockoutSizesFor', () => {
  it('lists every valid classic bracket', () => {
    expect(knockoutSizesFor(5, 1)).toEqual([2, 4]);
    expect(knockoutSizesFor(8, 2)).toEqual([2, 4, 8]);
    expect(knockoutSizesFor(12, 3)).toEqual([4, 8]);
  });
});
