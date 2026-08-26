export const environment = {
  production: false,
  // Temporarily pointed at this machine's LAN IP for phone-over-WiFi testing
  // (localhost would resolve to the phone itself, not this machine) --
  // revert with `git checkout apps/mobile/src/environments/environment.development.ts`
  // once done, same convention as infra/scripts/run-mobile-emulator.mjs.
  apiUrl: 'http://localhost:3000/api/v1',
  // Where the remaining external rows (contact/tarifs/mentions légales) open
  // -- "Connexion"/"Créer un tournoi" are native routes now (feat/193). Same
  // default as the API's own ADMIN_WEB_URL (organizations.service.ts,
  // tournaments.service.ts) -- that's also where this app's own emailed
  // verify-email links point, so a locally-verified account matches this port.
  webUrl: 'http://localhost:4200',
};
