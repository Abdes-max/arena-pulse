import { describe, expect, it } from 'vitest';
import { knockoutSizesFor, previewPlateau } from './plateau-preview';

const base = {
  teamCount: 5,
  fieldCount: 2,
  poolCount: 1,
  matchDurationMinutes: 22,
  breakDurationMinutes: 8,
  knockoutSize: null as number | null,
};

describe('previewPlateau', () => {
  it('matches the benchmark plateau: 5 teams on 2 fields = 10 matches in 5 rotations', () => {
    expect(previewPlateau(base)).toEqual({
      matchCount: 10,
      rotationCount: 5,
      minMatchesPerTeam: 4,
      maxMatchesPerTeam: 4,
      durationMinutes: 5 * 30 - 8,
    });
  });

  it('adds one rotation and one match for the final', () => {
    const preview = previewPlateau({ ...base, knockoutSize: 2 });

    expect(preview?.matchCount).toBe(11);
    expect(preview?.rotationCount).toBe(6);
  });

  it('adds semi-finals, the 3rd-place match and the final', () => {
    // 8 teams, 2 pools of 4 on 2 fields: 12 pool matches, then 2 semis
    // (1 rotation) and final + 3rd place (1 rotation).
    const preview = previewPlateau({
      ...base,
      teamCount: 8,
      poolCount: 2,
      knockoutSize: 4,
      thirdPlaceMatch: true,
    });

    expect(preview?.matchCount).toBe(12 + 4);
    expect(preview?.maxMatchesPerTeam).toBe(3 + 2);
  });

  it('only offers brackets the pools can feed', () => {
    expect(knockoutSizesFor(5, 1)).toEqual([2, 4]);
    expect(knockoutSizesFor(8, 2)).toEqual([2, 4, 8]);
    expect(knockoutSizesFor(12, 3)).toEqual([4, 8]);
  });

  it('never uses more rotations than needed when fields are plentiful', () => {
    // 4 teams: 3 rounds of 2 matches -- extra fields can't shorten it.
    expect(previewPlateau({ ...base, teamCount: 4, fieldCount: 3 })?.rotationCount).toBe(3);
  });

  it('rejects pools of fewer than 2 teams', () => {
    expect(previewPlateau({ ...base, teamCount: 3, poolCount: 2 })).toBeNull();
  });
});
