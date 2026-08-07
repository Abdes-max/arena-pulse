export const environment = {
  production: true,
  // Absolute, unlike apps/web's equivalent file -- a Capacitor app runs from
  // its own origin (capacitor://localhost on iOS, https://localhost on
  // Android), never from the production domain, so there is no same-origin
  // reverse proxy to lean on the way apps/web/src/environments/environment.ts
  // does. This was a pre-existing bug before this fix: it shipped
  // 'http://localhost:3000/api/v1' in every production build (this file has
  // no fileReplacement in angular.json's "production" configuration, same
  // gap ADR 0004 found and fixed for apps/web) and would only ever have
  // worked on the machine that built it. Must match infra/deployment/.env's
  // DOMAIN/WEB_PUBLIC_ORIGIN for the real deployment.
  apiUrl: 'https://tournarena.com/api/v1',
};
