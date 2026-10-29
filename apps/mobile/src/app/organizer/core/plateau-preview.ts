// Same as apps/web/src/app/admin/shared/plateau-preview.ts -- keep in sync.
// Live preview for the quick plateau form. Deliberately duplicated from
// apps/api/src/tournaments/round-robin.util.ts + rotation-scheduling.util.ts
// (the API doesn't consume shared-models, see ordinal.util.ts) -- keep the
// three in sync so the preview matches what generation actually produces.

export interface PlateauPreviewInput {
  teamCount: number;
  fieldCount: number;
  poolCount: number;
  matchDurationMinutes: number;
  breakDurationMinutes: number;
  withFinal: boolean;
}

export interface PlateauPreview {
  matchCount: number;
  rotationCount: number;
  minMatchesPerTeam: number;
  maxMatchesPerTeam: number;
  /** Minutes from the first kickoff to the final whistle. */
  durationMinutes: number;
}

interface Fixture {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

function roundRobin(teamIds: string[]): Fixture[] {
  if (teamIds.length < 2) {
    return [];
  }
  const slots: (string | null)[] = [...teamIds];
  if (slots.length % 2 !== 0) {
    slots.push(null);
  }
  const fixtures: Fixture[] = [];
  for (let round = 0; round < slots.length - 1; round++) {
    for (let i = 0; i < slots.length / 2; i++) {
      const home = slots[i];
      const away = slots[slots.length - 1 - i];
      if (home !== null && away !== null) {
        fixtures.push({ round: round + 1, homeTeamId: home, awayTeamId: away });
      }
    }
    const last = slots.pop()!;
    slots.splice(1, 0, last);
  }
  return fixtures;
}

function countRotations(fixtures: Fixture[], fieldCount: number): number {
  let remaining = [...fixtures];
  let rotations = 0;
  while (remaining.length > 0) {
    const busy = new Set<string>();
    const deferred: Fixture[] = [];
    let used = 0;
    for (const fixture of remaining) {
      if (used < fieldCount && !busy.has(fixture.homeTeamId) && !busy.has(fixture.awayTeamId)) {
        busy.add(fixture.homeTeamId);
        busy.add(fixture.awayTeamId);
        used++;
      } else {
        deferred.push(fixture);
      }
    }
    remaining = deferred;
    rotations++;
  }
  return rotations;
}

/** Null when the inputs can't make a valid plateau (e.g. a pool of one team). */
export function previewPlateau(input: PlateauPreviewInput): PlateauPreview | null {
  const { teamCount, fieldCount, poolCount } = input;
  if (teamCount < 2 || fieldCount < 1 || poolCount < 1 || poolCount * 2 > teamCount) {
    return null;
  }
  // Same balanced split as the structure preset (team i -> pool i % pools).
  const pools: string[][] = Array.from({ length: poolCount }, () => []);
  for (let i = 0; i < teamCount; i++) {
    pools[i % poolCount].push(`t${i}`);
  }
  const fixtures = pools.flatMap((pool) => roundRobin(pool)).sort((a, b) => a.round - b.round);
  const poolRotations = countRotations(fixtures, fieldCount);
  const rotationCount = poolRotations + (input.withFinal ? 1 : 0);
  const slot = input.matchDurationMinutes + input.breakDurationMinutes;
  const sizes = pools.map((pool) => pool.length - 1);
  const extra = input.withFinal ? 1 : 0;
  return {
    matchCount: fixtures.length + extra,
    rotationCount,
    minMatchesPerTeam: Math.min(...sizes),
    maxMatchesPerTeam: Math.max(...sizes) + extra,
    durationMinutes: rotationCount * slot - input.breakDurationMinutes,
  };
}
