export const environment = {
  production: false,
  // Temporarily pointed at this machine's LAN IP for phone-over-WiFi testing
  // (localhost would resolve to the phone itself, not this machine) --
  // revert with `git checkout apps/mobile/src/environments/environment.development.ts`
  // once done, same convention as infra/scripts/run-mobile-emulator.mjs.
  apiUrl: 'http://localhost:3000/api/v1',
};
