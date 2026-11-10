/**
 * Whether a tournament is over, for the organizer's "Passés / À venir"
 * filter. Over once its last day (endDate, else startDate) is before today;
 * a tournament with no date at all stays "à venir" so an undated draft is
 * never hidden from the organizer. Compares against the start of `now`'s
 * day, so a tournament ending today still counts as upcoming all day.
 */
export function isTournamentPast(
  tournament: { startDate?: string | null; endDate?: string | null },
  now = new Date(),
): boolean {
  const lastDay = tournament.endDate ?? tournament.startDate;
  if (!lastDay) {
    return false;
  }
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return new Date(lastDay) < todayStart;
}
