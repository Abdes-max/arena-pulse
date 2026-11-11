import { Prisma } from '../../generated/prisma/client';

export type PublicTimeFilter = 'upcoming' | 'past';

/**
 * "À venir" / "Passés" filter of the public directory. A tournament is over
 * once its last day (endDate, else startDate) is before today; undated ones
 * stay "à venir". Written with explicit positive conditions on both sides:
 * a NOT over nullable dates would drop the rows whose comparison is NULL.
 */
export function publicTimeWhere(
  time: PublicTimeFilter,
  now: Date = new Date(),
): Prisma.TournamentWhereInput {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  if (time === 'past') {
    return {
      OR: [
        { endDate: { lt: todayStart } },
        { endDate: null, startDate: { lt: todayStart } },
      ],
    };
  }
  return {
    OR: [
      { endDate: { gte: todayStart } },
      { endDate: null, startDate: { gte: todayStart } },
      { endDate: null, startDate: null },
    ],
  };
}
