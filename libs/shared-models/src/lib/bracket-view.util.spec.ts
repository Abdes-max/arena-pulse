import { Match } from './models';
import { buildBracketView } from './bracket-view.util';

function match(overrides: Partial<Match> & { id: string; round: number }): Match {
  return {
    groupId: null,
    knockoutBracketId: 'bracket-1',
    bracketSlot: 0,
    isThirdPlaceMatch: false,
    status: 'SCHEDULED',
    homeTeam: null,
    awayTeam: null,
    homeSourceLabel: null,
    awaySourceLabel: null,
    forfeitedTeam: null,
    timeSlot: null,
    officials: [],
    score: null,
    ...overrides,
  };
}

describe('buildBracketView', () => {
  it('groups matches by round and labels each round by distance from the final', () => {
    const matches: Match[] = [
      match({ id: 'sf1', round: 1, bracketSlot: 0 }),
      match({ id: 'sf2', round: 1, bracketSlot: 1 }),
      match({ id: 'final', round: 2, bracketSlot: 0 }),
    ];

    const view = buildBracketView(matches, 2);

    expect(
      view.rounds.map((r) => [r.round, r.label, r.singularLabel, r.matches.map((m) => m.id)]),
    ).toEqual([
      [1, 'Demi-finales', 'Demi-finale', ['sf1', 'sf2']],
      [2, 'Finale', 'Finale', ['final']],
    ]);
    expect(view.thirdPlaceMatch).toBeNull();
  });

  it('separates the third-place match out of the round grouping', () => {
    const matches: Match[] = [
      match({ id: 'final', round: 2 }),
      match({ id: 'third', round: 2, isThirdPlaceMatch: true }),
    ];

    const view = buildBracketView(matches, 2);

    expect(view.rounds).toEqual([
      { round: 2, label: 'Finale', singularLabel: 'Finale', matches: [matches[0]] },
    ]);
    expect(view.thirdPlaceMatch?.id).toBe('third');
  });

  it('sorts matches within a round by bracket slot', () => {
    const matches: Match[] = [
      match({ id: 'b', round: 1, bracketSlot: 1 }),
      match({ id: 'a', round: 1, bracketSlot: 0 }),
    ];

    const view = buildBracketView(matches, 1);

    expect(view.rounds[0].matches.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('names a round of 16 "huitièmes de finale" (matches, not teams)', () => {
    const matches: Match[] = [match({ id: 'r16-1', round: 1 })];

    const view = buildBracketView(matches, 4);

    expect(view.rounds[0].label).toBe('Huitièmes de finale');
  });
});
