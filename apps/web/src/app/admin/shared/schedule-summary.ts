import { Match } from 'shared-models';

export interface ScheduleSummary {
  matchCount: number;
  /** Placed matches only -- a match moved to "Non planifiés" has no slot. */
  placedCount: number;
  /** Distinct kickoff times, i.e. the "séries" every field plays in step. */
  rotationCount: number;
  start: string | null;
  end: string | null;
}

/** At-a-glance numbers for a calendar: how many matches, in how many rotations, from when to when. */
export function summarizeSchedule(matches: readonly Match[]): ScheduleSummary {
  const slots = matches
    .map((match) => match.timeSlot)
    .filter((slot): slot is NonNullable<Match['timeSlot']> => slot !== null);
  const starts = slots.map((slot) => slot.startTime).sort();
  const ends = slots.map((slot) => slot.endTime).sort();
  return {
    matchCount: matches.length,
    placedCount: slots.length,
    rotationCount: new Set(starts.map((start) => new Date(start).getTime())).size,
    start: starts[0] ?? null,
    end: ends[ends.length - 1] ?? null,
  };
}
