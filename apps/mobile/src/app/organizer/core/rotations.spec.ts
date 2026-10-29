import { describe, expect, it } from 'vitest';
import { Match } from 'shared-models';
import { groupRotations, pickCurrentAndNext } from './rotations';

function match(id: string, start: string, field: string, status = 'SCHEDULED'): Match {
  return {
    id,
    status,
    timeSlot: { id: `s${id}`, startTime: start, endTime: start, field: { id: field, name: field } },
  } as Match;
}

const T1 = '2026-11-11T09:00:00.000Z';
const T2 = '2026-11-11T09:30:00.000Z';
const T3 = '2026-11-11T10:00:00.000Z';

describe('groupRotations', () => {
  it('groups by kickoff and orders fields naturally', () => {
    const rotations = groupRotations([
      match('b', T2, 'Terrain 10'),
      match('a', T1, 'Terrain 2'),
      match('c', T2, 'Terrain 2'),
      { ...match('x', T1, 'T'), timeSlot: null } as Match,
    ]);

    expect(rotations.map((r) => r.matches.map((m) => m.id))).toEqual([['a'], ['c', 'b']]);
  });
});

describe('pickCurrentAndNext', () => {
  const rotations = groupRotations([
    match('1', T1, 'T1', 'COMPLETED'),
    match('2', T2, 'T1'),
    match('3', T3, 'T1'),
  ]);

  it('shows only "next" before the first kickoff', () => {
    const fresh = groupRotations([match('1', T1, 'T1'), match('2', T2, 'T1')]);

    const picked = pickCurrentAndNext(fresh, new Date('2026-11-11T08:00:00.000Z'));

    expect(picked.current).toBeNull();
    expect(picked.next?.startTime).toBe(T1);
  });

  it('treats the latest unfinished kicked-off rotation as current', () => {
    const picked = pickCurrentAndNext(rotations, new Date('2026-11-11T09:40:00.000Z'));

    expect(picked.current?.startTime).toBe(T2);
    expect(picked.next?.startTime).toBe(T3);
  });

  it('prefers a rotation with a live match, even if running late', () => {
    const late = groupRotations([match('1', T1, 'T1', 'LIVE'), match('2', T2, 'T1')]);

    const picked = pickCurrentAndNext(late, new Date('2026-11-11T09:45:00.000Z'));

    expect(picked.current?.startTime).toBe(T1);
    expect(picked.next?.startTime).toBe(T2);
  });

  it('skips already finished rotations when picking "next"', () => {
    // Rotation 2 was played (and validated) before rotation 1 was entered.
    const outOfOrder = groupRotations([
      match('1', T1, 'T1'),
      match('2', T2, 'T1', 'COMPLETED'),
      match('3', T3, 'T1'),
    ]);

    const picked = pickCurrentAndNext(outOfOrder, new Date('2026-11-11T09:40:00.000Z'));

    expect(picked.current?.startTime).toBe(T1);
    expect(picked.next?.startTime).toBe(T3);
  });

  it('returns nothing once every match is finished', () => {
    const done = groupRotations([match('1', T1, 'T1', 'COMPLETED')]);

    expect(pickCurrentAndNext(done, new Date('2026-11-11T12:00:00.000Z'))).toEqual({
      current: null,
      next: null,
    });
  });
});
