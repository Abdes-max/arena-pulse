import { checkSets, countSetsWon, resolveScoring } from './sets-score.util';

describe('resolveScoring', () => {
  const padel = { scoreFormat: 'SETS', defaultSetsToWin: 2 } as const;

  it("uses the sport's default when the phase has no override", () => {
    expect(resolveScoring({ phaseSetsToWin: null, sport: padel })).toEqual({
      format: 'SETS',
      setsToWin: 2,
    });
  });

  it("lets the phase override the sport's default (best of 5 in the final)", () => {
    expect(resolveScoring({ phaseSetsToWin: 3, sport: padel }).setsToWin).toBe(
      3,
    );
  });
});

describe('countSetsWon', () => {
  it('counts the sets each side won, ignoring a tied set in progress', () => {
    expect(
      countSetsWon([
        { home: 6, away: 4 },
        { home: 3, away: 6 },
        { home: 5, away: 5 },
      ]),
    ).toEqual({ home: 1, away: 1 });
  });
});

describe('checkSets', () => {
  it('accepts a 2-0 win in best of 3', () => {
    expect(
      checkSets(
        [
          { home: 6, away: 4 },
          { home: 6, away: 3 },
        ],
        2,
        true,
      ),
    ).toEqual({ home: 2, away: 0 });
  });

  it('accepts a 2-1 win with a super tie-break as the third set', () => {
    expect(
      checkSets(
        [
          { home: 4, away: 6 },
          { home: 6, away: 4 },
          { home: 10, away: 7 },
        ],
        2,
        true,
      ),
    ).toEqual({ home: 2, away: 1 });
  });

  it('refuses a final result where nobody reached the sets to win', () => {
    expect(
      checkSets(
        [
          { home: 6, away: 4 },
          { home: 3, away: 6 },
        ],
        2,
        true,
      ),
    ).toHaveProperty('error');
  });

  it('refuses a tied set in a final result', () => {
    expect(
      checkSets(
        [
          { home: 6, away: 6 },
          { home: 6, away: 3 },
        ],
        2,
        true,
      ),
    ).toHaveProperty('error');
  });

  it('refuses a set played after the match was decided', () => {
    expect(
      checkSets(
        [
          { home: 6, away: 4 },
          { home: 6, away: 3 },
          { home: 6, away: 0 },
        ],
        2,
        false,
      ),
    ).toHaveProperty('error');
  });

  it('refuses more sets than the format allows', () => {
    expect(
      checkSets(
        [
          { home: 6, away: 4 },
          { home: 4, away: 6 },
          { home: 6, away: 4 },
          { home: 4, away: 6 },
        ],
        2,
        false,
      ),
    ).toHaveProperty('error');
  });

  it('accepts a match in progress: nobody at the sets to win, last set tied', () => {
    expect(
      checkSets(
        [
          { home: 6, away: 4 },
          { home: 2, away: 2 },
        ],
        2,
        false,
      ),
    ).toEqual({ home: 1, away: 0 });
  });

  it('refuses a tied set that is not the last one, even in progress', () => {
    expect(
      checkSets(
        [
          { home: 3, away: 3 },
          { home: 6, away: 4 },
        ],
        2,
        false,
      ),
    ).toHaveProperty('error');
  });
});
