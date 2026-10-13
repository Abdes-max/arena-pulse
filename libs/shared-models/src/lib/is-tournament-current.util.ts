import { PublicTournamentSummary } from './models';

/**
 * Whether a tournament belongs in a "happening now or soon" list (the web
 * landing page's marquee, apps/mobile's tournament-entry hero) -- kept while
 * its own endDate hasn't passed yet, falling back to the latest scheduled
 * match's end time when the organizer never set one (common for a one-day
 * "plateau" tournament), and kept outright when there's nothing to compare
 * against at all (no endDate, no scheduled match either -- that can't be
 * confidently called past). Compares against the start of `now`'s day, not
 * the exact instant, so a tournament ending today still shows all day.
 */
export function isTournamentCurrentOrUpcoming(
  tournament: Pick<PublicTournamentSummary, 'endDate' | 'lastMatchDate'>,
  now = new Date(),
): boolean {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const effectiveEnd = tournament.endDate ?? tournament.lastMatchDate;
  return !effectiveEnd || new Date(effectiveEnd) >= todayStart;
}
