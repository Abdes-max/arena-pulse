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
  /** Teams in the knockout phase after the pools (2 = final, 4 = semis...), or null. */
  knockoutSize: number | null;
  thirdPlaceMatch?: boolean;
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

// Knockout phase after the pools -- same rules as apps/api's
// knockout-phase.util.ts (keep in sync): a classic single-elimination
// bracket of 2/4/8... teams, the pools' top places plus, when pools don't
// divide it evenly, the best teams at the next place.
export const KNOCKOUT_SIZES = [2, 4, 8, 16, 32] as const;

export function knockoutSizesFor(teamCount: number, poolCount: number): number[] {
  if (poolCount < 1) {
    return [];
  }
  const smallestPool = Math.floor(teamCount / poolCount);
  return KNOCKOUT_SIZES.filter((size) => {
    const qualifiersPerPool = Math.floor(size / poolCount);
    const bestCount = size % poolCount;
    return (
      size <= teamCount &&
      qualifiersPerPool >= 1 &&
      qualifiersPerPool + (bestCount > 0 ? 1 : 0) <= smallestPool
    );
  });
}

/** Rounds of a bracket of size, each spread over the fields; the 3rd-place match joins the final's round. */
function knockoutRounds(size: number | null, thirdPlace: boolean, fieldCount: number) {
  if (!size) {
    return { matches: 0, rotations: 0, rounds: 0 };
  }
  let matches = 0;
  let rotations = 0;
  let rounds = 0;
  for (let teams = size; teams >= 2; teams /= 2) {
    const inRound = teams / 2 + (teams === 2 && thirdPlace && size >= 4 ? 1 : 0);
    matches += inRound;
    rotations += Math.ceil(inRound / fieldCount);
    rounds++;
  }
  return { matches, rotations, rounds };
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
  const knockout = knockoutRounds(input.knockoutSize, !!input.thirdPlaceMatch, fieldCount);
  const rotationCount = poolRotations + knockout.rotations;
  const slot = input.matchDurationMinutes + input.breakDurationMinutes;
  const sizes = pools.map((pool) => pool.length - 1);
  return {
    matchCount: fixtures.length + knockout.matches,
    rotationCount,
    minMatchesPerTeam: Math.min(...sizes),
    maxMatchesPerTeam: Math.max(...sizes) + knockout.rounds,
    durationMinutes: rotationCount * slot - input.breakDurationMinutes,
  };
}
