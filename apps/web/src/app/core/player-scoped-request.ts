/**
 * True for requests that must carry a PlayerAccount bearer token rather than
 * an organizer one: player-auth itself, plus the two /public endpoints that
 * require a signed-in player (submitting a registration, listing your own).
 * Shared between player-auth.interceptor.ts (which attaches the player
 * token here) and admin/core/auth.interceptor.ts (which must NOT attach the
 * organizer token here instead) so both agree on the same boundary --
 * otherwise a visitor signed in as both an organizer and a player in the
 * same browser could have one session's token silently override the other's.
 */
export function isPlayerScopedRequest(url: string): boolean {
  // The `/public/` check matters: an organizer's own registrations list
  // (/organizations/:id/tournaments/:id/registrations) also contains
  // "registrations" and must keep using the organizer token instead.
  return url.includes('/player-auth') || (url.includes('/public/') && url.includes('/registrations'));
}
