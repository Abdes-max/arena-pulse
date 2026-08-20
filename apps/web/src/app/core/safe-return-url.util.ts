// Audit finding (securite-audit.md): `returnUrl` on the 4 login/register
// pages comes straight from the query string -- attacker-controlled, since
// anyone can send a victim a link like
// `/login?returnUrl=//evil.com` or `/login?returnUrl=https://evil.com`.
// Feeding that directly into `Router.navigateByUrl()` risks an open
// redirect out of the app right after a successful login (a phishing
// primer: "you just logged into TournArena, now here's a lookalike page
// asking you to log in again"). Only a same-app, single-leading-slash path
// is safe to trust; anything else falls back to the caller's own default.
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
