/**
 * True for requests that must carry a SuperAdminAccount bearer token rather
 * than an organizer or player one -- both /super-admin-auth (login/refresh/
 * logout/me) and /super-admin/* (the data endpoints) start with
 * "/super-admin". Shared between super-admin-auth.interceptor.ts (which
 * attaches the super-admin token here) and admin/core/auth.interceptor.ts +
 * core/player-auth.interceptor.ts (which must NOT attach their own tokens
 * here instead) so all three agree on the same boundary -- same rationale
 * as player-scoped-request.ts's isPlayerScopedRequest.
 */
export function isSuperAdminScopedRequest(url: string): boolean {
  return url.includes('/super-admin');
}
