import { describe, expect, it } from 'vitest';
import { MatchStatus } from 'shared-models';
import { matchStatusFilterOf } from './match-status-filter';

describe('matchStatusFilterOf', () => {
  it.each<[MatchStatus, string]>([
    ['SCHEDULED', 'upcoming'],
    ['POSTPONED', 'upcoming'],
    ['LIVE', 'live'],
    ['COMPLETED', 'finished'],
    ['FORFEITED', 'finished'],
    ['CANCELLED', 'finished'],
  ])('puts a %s match under "%s"', (status, expected) => {
    expect(matchStatusFilterOf({ status })).toBe(expected);
  });
});
