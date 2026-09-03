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
  // Where the remaining external rows (contact/tarifs/mentions légales) open
  // -- "Connexion"/"Créer un tournoi" are native routes now (feat/193, see
  // app.routes.ts's organizer/* routes), no longer built from this.
  webUrl: 'https://tournarena.com',
  // RevenueCat's own PUBLIC API key for the iOS app (prefixed `appl_`,
  // deliberately different from the SECRET key the backend holds in
  // apps/api/.env -- see RevenueCatService's module comment) -- safe to
  // ship client-side by design, same posture RevenueCat's own docs take on
  // this key (it authenticates the app, not a user or an organization).
  // Used only on iOS (IapService checks isIosNative() before configuring
  // Purchases at all) -- guideline 3.1.1, see ADR 0008.
  revenueCatApiKey: 'appl_bVmmdsLVmSmGazbtlCXlerQMJWK',
};
