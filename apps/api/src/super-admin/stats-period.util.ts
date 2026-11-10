import { StatsPeriod } from './dto/stats-query.dto';

export interface StatsRange {
  from: Date | null;
  to: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '365d': 365 };

/**
 * The dashboard's date window. `null` means "everything" (no filter). A preset
 * covers the last N days up to `now`; "custom" takes whole days from/to
 * (YYYY-MM-DD, either one optional, bounds included); with neither it is
 * the same as "all".
 */
export function resolveStatsRange(
  period: StatsPeriod | undefined,
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date(),
): StatsRange | null {
  if (!period || period === 'all') {
    return null;
  }
  if (period === 'custom') {
    const start = from ? new Date(`${from.slice(0, 10)}T00:00:00.000`) : null;
    const end = to ? new Date(`${to.slice(0, 10)}T23:59:59.999`) : null;
    if (!start && !end) {
      return null;
    }
    return { from: start, to: end };
  }
  return {
    from: new Date(now.getTime() - PRESET_DAYS[period] * DAY_MS),
    to: null,
  };
}

/** Prisma date filter for a range, or undefined when there is none. */
export function dateFilter(range: StatsRange | null) {
  if (!range) {
    return undefined;
  }
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}
