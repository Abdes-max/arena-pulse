import { describe, expect, it } from 'vitest';
import { assignPastedNames, isPlaceholderTeamName } from './placeholder-teams';

describe('isPlaceholderTeamName', () => {
  it('recognizes generated names only', () => {
    expect(isPlaceholderTeamName('Équipe 3')).toBe(true);
    expect(isPlaceholderTeamName('Équipe 12 ')).toBe(true);
    expect(isPlaceholderTeamName('ES Milloise')).toBe(false);
    expect(isPlaceholderTeamName('Équipe B')).toBe(false);
  });
});

describe('assignPastedNames', () => {
  const teams = [
    { id: 'a', name: 'Équipe 1' },
    { id: 'b', name: 'Carnoux FC' },
    { id: 'c', name: 'Équipe 3' },
  ];

  it('fills placeholder teams first, in order', () => {
    const renames = assignPastedNames(teams, 'US Venelles\nAS Grans');

    expect([...renames]).toEqual([
      ['a', 'US Venelles'],
      ['c', 'AS Grans'],
    ]);
  });

  it('accepts comma or semicolon separated lists and skips blanks', () => {
    const renames = assignPastedNames(teams, ' US Venelles ; ; AS Grans, Gardanne ');

    expect(renames.get('a')).toBe('US Venelles');
    expect(renames.get('c')).toBe('AS Grans');
    expect(renames.get('b')).toBe('Gardanne');
  });

  it('ignores names beyond the number of teams', () => {
    expect(assignPastedNames(teams, 'A\nB\nC\nD').size).toBe(3);
  });
});
