import { describe, expect, it } from 'vitest';
import { Match } from 'shared-models';
import { summarizeSchedule } from './schedule-summary';

function match(id: string, start: string | null, end?: string): Match {
  return {
    id,
    timeSlot: start
      ? { id: `slot-${id}`, startTime: start, endTime: end ?? start, field: { id: 'f', name: 'T' } }
      : null,
  } as Match;
}

describe('summarizeSchedule', () => {
  it('returns zeros for an empty calendar', () => {
    expect(summarizeSchedule([])).toEqual({
      matchCount: 0,
      placedCount: 0,
      rotationCount: 0,
      start: null,
      end: null,
    });
  });

  it('counts each shared kickoff time once as a rotation', () => {
    const summary = summarizeSchedule([
      match('1', '2026-11-11T09:30:00.000Z', '2026-11-11T09:52:00.000Z'),
      match('2', '2026-11-11T09:30:00.000Z', '2026-11-11T09:52:00.000Z'),
      match('3', '2026-11-11T10:00:00.000Z', '2026-11-11T10:22:00.000Z'),
      match('4', null),
    ]);

    expect(summary).toEqual({
      matchCount: 4,
      placedCount: 3,
      rotationCount: 2,
      start: '2026-11-11T09:30:00.000Z',
      end: '2026-11-11T10:22:00.000Z',
    });
  });
});
