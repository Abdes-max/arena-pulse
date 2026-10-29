import { describe, expect, it } from 'vitest';
import { previewPlateau } from './plateau-preview';

const base = {
  teamCount: 5,
  fieldCount: 2,
  poolCount: 1,
  matchDurationMinutes: 22,
  breakDurationMinutes: 8,
  withFinal: false,
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
    const preview = previewPlateau({ ...base, withFinal: true });

    expect(preview?.matchCount).toBe(11);
    expect(preview?.rotationCount).toBe(6);
  });

  it('never uses more rotations than needed when fields are plentiful', () => {
    // 4 teams: 3 rounds of 2 matches -- extra fields can't shorten it.
    expect(previewPlateau({ ...base, teamCount: 4, fieldCount: 3 })?.rotationCount).toBe(3);
  });

  it('rejects pools of fewer than 2 teams', () => {
    expect(previewPlateau({ ...base, teamCount: 3, poolCount: 2 })).toBeNull();
  });
});
