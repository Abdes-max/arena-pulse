export interface Pairing {
  homeTeamId: string;
  awayTeamId: string;
}

export interface RotationSlot<T extends Pairing> {
  fixture: T;
  /** 0-based index of the shared time slot ("série") the match is played in. */
  rotation: number;
  /** 0-based index into the field list. */
  fieldIndex: number;
}

/**
 * Places fixtures into rotations -- time slots shared by every field --
 * filling each rotation with at most `fieldCount` matches whose teams are all
 * still free in it. Fixtures are taken in the given order (callers sort by
 * round), so earlier rounds are played first; a fixture that would make a
 * team play twice at once is simply pushed to a later rotation.
 *
 * Assigning fields in turn with one independent clock per field (the old
 * approach) let a round-N+1 match start alongside a round-N match as soon as a
 * round had more matches than fields -- with the same team in both.
 */
export function assignRotations<T extends Pairing>(
  fixtures: readonly T[],
  fieldCount: number,
): RotationSlot<T>[] {
  if (fieldCount < 1) {
    throw new Error('fieldCount must be at least 1');
  }

  const slots: RotationSlot<T>[] = [];
  let remaining = [...fixtures];
  for (let rotation = 0; remaining.length > 0; rotation++) {
    const busyTeams = new Set<string>();
    const deferred: T[] = [];
    let fieldIndex = 0;
    for (const fixture of remaining) {
      if (
        fieldIndex < fieldCount &&
        !busyTeams.has(fixture.homeTeamId) &&
        !busyTeams.has(fixture.awayTeamId)
      ) {
        slots.push({ fixture, rotation, fieldIndex });
        busyTeams.add(fixture.homeTeamId);
        busyTeams.add(fixture.awayTeamId);
        fieldIndex++;
      } else {
        deferred.push(fixture);
      }
    }
    remaining = deferred;
  }
  return slots;
}
