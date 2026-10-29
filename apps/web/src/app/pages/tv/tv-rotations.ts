import { Match } from 'shared-models';

export interface Rotation {
  startTime: string;
  matches: Match[];
}

const FINISHED = new Set(['COMPLETED', 'FORFEITED', 'CANCELLED']);

/** Groups scheduled matches by kickoff time -- one group per "série" every field plays together. */
export function groupRotations(matches: readonly Match[]): Rotation[] {
  const byStart = new Map<number, Match[]>();
  for (const match of matches) {
    if (!match.timeSlot) {
      continue;
    }
    const key = new Date(match.timeSlot.startTime).getTime();
    byStart.set(key, [...(byStart.get(key) ?? []), match]);
  }
  return [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, group]) => ({
      startTime: new Date(start).toISOString(),
      matches: [...group].sort((a, b) =>
        (a.timeSlot?.field.name ?? '').localeCompare(b.timeSlot?.field.name ?? '', undefined, {
          numeric: true,
        }),
      ),
    }));
}

/**
 * What the TV screen shows: the rotation being played (a live match in it,
 * or the latest one already kicked off that isn't finished) and the one
 * after it. Before the first kickoff there's no current one, only "next".
 */
export function pickCurrentAndNext(
  rotations: readonly Rotation[],
  now: Date,
): { current: Rotation | null; next: Rotation | null } {
  const isFinished = (rotation: Rotation) =>
    rotation.matches.every((match) => FINISHED.has(match.status));

  let currentIndex = rotations.findIndex((rotation) =>
    rotation.matches.some((match) => match.status === 'LIVE'),
  );
  if (currentIndex === -1) {
    for (let i = rotations.length - 1; i >= 0; i--) {
      if (new Date(rotations[i].startTime) <= now && !isFinished(rotations[i])) {
        currentIndex = i;
        break;
      }
    }
  }
  if (currentIndex >= 0) {
    // Rotations aren't always entered in order -- skip any later one that
    // was already played instead of announcing it as "up next".
    const next = rotations.slice(currentIndex + 1).find((rotation) => !isFinished(rotation));
    return { current: rotations[currentIndex], next: next ?? null };
  }
  const nextIndex = rotations.findIndex(
    (rotation) => new Date(rotation.startTime) > now && !isFinished(rotation),
  );
  return { current: null, next: nextIndex >= 0 ? rotations[nextIndex] : null };
}
