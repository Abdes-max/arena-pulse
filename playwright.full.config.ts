import { defineConfig, devices } from '@playwright/test';

// Opt-in, local-only suite -- NOT wired into `npm run e2e` or the CI
// "End-to-end (Playwright)" job (see .github/workflows/ci.yml), which
// deliberately runs without a backend or database (just `ng serve web`,
// smoke-testing static pages and client-side route guards only). The specs
// under e2e-full/ exercise full tournament lifecycles (teams, structure,
// scores, publication) against a real API + Postgres, which CI doesn't
// provision -- adding that is a separate, bigger infra change, not made
// here (see the plan file's "PR 4+" section for the reasoning).
//
// Prerequisites (same local dev stack these tests were written against):
//   1. `docker compose up -d` in infra/compose (Postgres + Mailhog + MinIO)
//   2. `npx prisma migrate deploy` in apps/api (+ `npx prisma db seed` once,
//      for the Sport rows every tournament needs)
//   3. `npm run dev:api` (apps/api on :3000)
// Then run: `npm run e2e:full` -- this config's own webServer entries start
// `dev:web`/`dev:mobile` for you (reused if already running locally).
export default defineConfig({
  testDir: './e2e-full',
  // Team-capacity and full-lifecycle specs run many sequential API calls
  // and match-by-match UI interactions -- generous but not unbounded.
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
    // Every spec's locators use the app's French copy (this repo's
    // default/reference language, per apps/{web,mobile}'s own i18n
    // convention) -- without this, Playwright's Chromium defaults to
    // en-US and Transloco picks English from navigator.language instead.
    locale: 'fr-FR',
  },
  projects: [
    {
      name: 'web',
      testMatch: /.*\.web\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4200' },
    },
    {
      name: 'mobile',
      testMatch: /.*\.mobile\.spec\.ts/,
      // 'Pixel 7' (Chromium + touch/mobile emulation) rather than an iPhone
      // device preset -- those default to WebKit, a separate browser binary
      // not installed by this repo's `npx playwright install --with-deps
      // chromium` (see .github/workflows/ci.yml); Chromium is also what was
      // used for all the manual verification this session.
      use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4400' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:web -- --port 4200',
      url: 'http://localhost:4200',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:mobile',
      url: 'http://localhost:4400',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
