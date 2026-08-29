#!/usr/bin/env node
// Recaptures the 4 App Store / Play Store screenshots (découverte, fiche
// tournoi, phase finale, calendrier) against a local `ng serve mobile`
// (port 4400) pointed at a local API with the showcase tournament seeded
// (apps/api/prisma/seed-world-cup-2026.ts + update-world-cup-2026.ts).
//
// Written 2026-08-28 to replace the original captures, which were taken by
// hand on the Android emulator (see store-assets/README.md) -- besides
// showing an Android status bar (App Store guideline 2.3.10: "remove
// non-iOS status bar images"), those captures also predate the 2026-08-28
// rebrand and still showed the old "Coupe du Monde FIFA 2026" name/logo
// (guideline 5.2.1). This script sidesteps both problems by screenshotting
// a bare Playwright viewport with NO OS chrome at all -- Apple's own
// instruction was to *remove* the non-iOS status bar, not replace it with a
// simulated iOS one, and a chrome-less content screenshot satisfies that
// directly without needing a real iOS Simulator (no local Mac, see ADR
// 0008). Also used for the Play Store set (same directory of screenshots,
// no OS-chrome requirement there either) to stay consistent and avoid the
// same stale-content problem there.
//
// Usage (from repo root, with `npm run dev:api` and `npm run dev:mobile`
// already running, and the showcase tournament seeded/updated locally --
// see apps/api/prisma/seed-world-cup-2026.ts's own usage comment):
//   node infra/scripts/capture-store-screenshots.mjs <tournament-slug>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.env.MOBILE_URL ?? 'http://localhost:4400';
const SLUG = process.argv[2];
if (!SLUG) {
  console.error('Usage: node infra/scripts/capture-store-screenshots.mjs <tournament-slug>');
  process.exit(1);
}

const STORE_ASSETS = join(REPO_ROOT, 'apps', 'mobile', 'store-assets');

// Each output pixel size = CSS viewport x deviceScaleFactor -- e.g. 6.5in's
// 414x896 @3x = the exact 1242x2688 App Store Connect requires for that
// device class (no need to match any specific real device's viewport, only
// the final pixel product).
const SIZES = {
  '6.5in': {
    width: 414,
    height: 896,
    deviceScaleFactor: 3, // -> 1242x2688
    outDir: join(STORE_ASSETS, 'app-store', 'screenshots-6.5in'),
  },
  'ipad-13in': {
    width: 1032,
    height: 1376,
    deviceScaleFactor: 2, // -> 2064x2752
    outDir: join(STORE_ASSETS, 'app-store', 'screenshots-ipad-13in'),
  },
  play: {
    width: 360,
    height: 800,
    deviceScaleFactor: 3, // -> 1080x2400
    outDir: join(STORE_ASSETS, 'play', 'screenshots'),
  },
};

const SCREENS = [
  { name: '1-decouverte', path: '/', afterLoad: null },
  { name: '2-tournoi', path: `/${SLUG}`, afterLoad: null },
  {
    name: '3-phase-finale',
    path: `/${SLUG}/standings`,
    afterLoad: async (page) => {
      // Raw DOM click, not Playwright's own click -- ion-segment-button's
      // shadow-DOM internals intercept pointer events on the normal
      // actionability-checked click here (same class of fix e2e-full's own
      // clickResilient() uses for fast-reacting Ionic/Angular controls).
      await page.locator('ion-segment-button[value="final"]').evaluate((el) => el.click());
      await page.waitForTimeout(600);
    },
  },
  { name: '4-calendrier', path: `/${SLUG}/schedule`, afterLoad: null },
];

for (const [, viewport] of Object.entries(SIZES)) {
  mkdirSync(viewport.outDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    locale: 'fr-FR',
  });
  const page = await context.newPage();
  for (const screen of SCREENS) {
    // Not 'networkidle': the app keeps a live-updates WebSocket open
    // (realtime-client) that never goes idle -- domcontentloaded + a fixed
    // settle wait, same as this repo's e2e-full suite uses for this app.
    await page.goto(`${BASE}${screen.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    if (screen.afterLoad) {
      await screen.afterLoad(page);
    }
    const outPath = join(viewport.outDir, `${screen.name}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved ${outPath}`);
  }
  await browser.close();
}
