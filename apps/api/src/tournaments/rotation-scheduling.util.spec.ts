import { generateRoundRobinFixtures } from './round-robin.util';
import {
  assignRotations,
  Pairing,
  RotationSlot,
} from './rotation-scheduling.util';

const teamIds = (count: number, prefix = 't') =>
  Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);

const expectNoTeamTwiceInARotation = (slots: RotationSlot<Pairing>[]) => {
  const teamsByRotation = new Map<number, string[]>();
  for (const { fixture, rotation } of slots) {
    const teams = teamsByRotation.get(rotation) ?? [];
    teams.push(fixture.homeTeamId, fixture.awayTeamId);
    teamsByRotation.set(rotation, teams);
  }
  for (const teams of teamsByRotation.values()) {
    expect(new Set(teams).size).toBe(teams.length);
  }
};

describe('assignRotations', () => {
  it('returns nothing for no fixtures', () => {
    expect(assignRotations([], 2)).toEqual([]);
  });

  it('rejects a field count below 1', () => {
    expect(() =>
      assignRotations(generateRoundRobinFixtures(teamIds(4)), 0),
    ).toThrow();
  });

  it('plays a 5-team pool on 2 fields in 5 rotations', () => {
    const slots = assignRotations(generateRoundRobinFixtures(teamIds(5)), 2);

    expect(slots).toHaveLength(10);
    expect(Math.max(...slots.map((slot) => slot.rotation))).toBe(4);
    expectNoTeamTwiceInARotation(slots);
  });

  it('never puts a team in two simultaneous matches for 6 teams on 2 fields', () => {
    const slots = assignRotations(generateRoundRobinFixtures(teamIds(6)), 2);

    expect(slots).toHaveLength(15);
    expectNoTeamTwiceInARotation(slots);
  });

  it('never uses more fields than available in a rotation', () => {
    const slots = assignRotations(generateRoundRobinFixtures(teamIds(8)), 3);

    const perRotation = new Map<number, Set<number>>();
    for (const { rotation, fieldIndex } of slots) {
      const fields = perRotation.get(rotation) ?? new Set<number>();
      expect(fields.has(fieldIndex)).toBe(false);
      fields.add(fieldIndex);
      perRotation.set(rotation, fields);
    }
    for (const fields of perRotation.values()) {
      expect(fields.size).toBeLessThanOrEqual(3);
    }
    expectNoTeamTwiceInARotation(slots);
  });

  it('shares fields between several pools without conflicts', () => {
    const fixtures = [
      ...generateRoundRobinFixtures(teamIds(5, 'a')),
      ...generateRoundRobinFixtures(teamIds(4, 'b')),
    ].sort((a, b) => a.round - b.round);

    const slots = assignRotations(fixtures, 3);

    expect(slots).toHaveLength(16);
    expectNoTeamTwiceInARotation(slots);
  });

  it('schedules every fixture exactly once', () => {
    const fixtures = generateRoundRobinFixtures(teamIds(7));

    const slots = assignRotations(fixtures, 2);

    expect(slots.map((slot) => slot.fixture)).toEqual(
      expect.arrayContaining(fixtures),
    );
    expect(new Set(slots.map((slot) => slot.fixture)).size).toBe(
      fixtures.length,
    );
  });
});
