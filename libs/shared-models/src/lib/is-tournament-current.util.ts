import { PublicTournamentSummary } from './models';

/**
 * Whether a tournament belongs in a "happening now or soon" list (the web
 * landing page's marquee and "Compétitions en cours" grid, apps/mobile's
 * tournament-entry hero) -- excluded outright when there's no date
 * information at all (no startDate, no endDate, no scheduled match: an
 * organizer who never dated their tournament shouldn't have it show up here
 * forever). Otherwise kept while its own endDate hasn't passed yet, falling
 * back to the latest scheduled match's end time when the organizer never set
 * one (common for a one-day "plateau" tournament), or kept regardless when
 * only a startDate is known (nothing marks it as over yet). Compares against
 * the start of `now`'s day, not the exact instant, so a tournament ending
 * today still shows all day.
 */
export function isTournamentCurrentOrUpcoming(
  tournament: Pick<PublicTournamentSummary, 'startDate' | 'endDate' | 'lastMatchDate'>,
  now = new Date(),
): boolean {
  if (!tournament.startDate && !tournament.endDate && !tournament.lastMatchDate) {
    return false;
  }
  const effectiveEnd = tournament.endDate ?? tournament.lastMatchDate;
  if (!effectiveEnd) {
    return true;
  }
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return new Date(effectiveEnd) >= todayStart;
}
