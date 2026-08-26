// Ported verbatim from apps/web/src/app/core/safe-return-url.util.ts -- see
// its own comment. Same open-redirect risk applies here: organizer/login's
// `returnUrl` query param is attacker-controlled.
export function isSafeReturnUrl(url: string | null | undefined): url is string {
  if (!url) {
    return false;
  }
  // Exactly one leading slash: rejects protocol-relative URLs ("//evil.com",
  // which the browser resolves against the current scheme) and the
  // backslash variant ("/\evil.com", which some browsers normalize to the
  // same thing), while still accepting every real in-app route.
  return /^\/(?!\/|\\)/.test(url);
}
