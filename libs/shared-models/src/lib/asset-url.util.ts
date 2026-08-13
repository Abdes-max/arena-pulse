// Team logos (feat/045) are returned by the API as a path relative to its
// own origin (e.g. "/uploads/team-logos/x.png"), not a full URL -- the API
// doesn't know its own public origin at request time (it's set per
// deployment, see docker-compose.prod.yml), and a relative path also
// happens to be exactly what a same-origin web deployment needs unchanged
// (apps/web's environment.apiUrl is itself relative in production, proxied
// by nginx -- see infra/docker/web.nginx.conf).
//
// The mobile app calls the API from a different origin entirely
// (capacitor://localhost), so a bare relative path would resolve against
// the wrong origin there -- this derives the API's actual origin from
// environment.apiUrl (stripping the "/api/v1" suffix) and prepends it,
// which is a no-op when apiUrl is itself relative (web production).
export function resolveAssetUrl(path: string | null, apiUrl: string): string | null {
  if (!path) {
    return null;
  }
  const origin = apiUrl.replace(/\/api\/v1\/?$/, '');
  return `${origin}${path}`;
}
