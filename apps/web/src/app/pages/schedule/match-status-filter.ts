import { Match } from 'shared-models';

export type MatchStatusFilter = 'upcoming' | 'live' | 'finished';

export const MATCH_STATUS_FILTERS: readonly MatchStatusFilter[] = ['upcoming', 'live', 'finished'];

/**
 * Which of the public schedule's three filter buttons a match falls under.
 * A score that's been entered but not validated yet keeps the match LIVE,
 * so it stays under "En cours" until the organizer confirms the result.
 */
export function matchStatusFilterOf(match: Pick<Match, 'status'>): MatchStatusFilter {
  switch (match.status) {
    case 'LIVE':
      return 'live';
    case 'COMPLETED':
    case 'FORFEITED':
    case 'CANCELLED':
      return 'finished';
    default:
      return 'upcoming';
  }
}
