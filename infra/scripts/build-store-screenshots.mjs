#!/usr/bin/env node
// Builds the App Store screenshots: captures the mobile app (`ng serve
// mobile`, port 4400) showing a real tournament, then composes each capture
// into a marketing visual (brand gradient, headline, phone/tablet frame) at
// the exact sizes App Store Connect expects.
//
// Public pages read the tournament from PRODUCTION (read-only GETs on
// /api/v1/public and /uploads, re-routed by Playwright), so the visuals show
// real data without seeding anything locally. The organizer screen uses the
// local API and a local test account.
//
// Usage (from repo root, `npm run dev:mobile` running, local API on 3001):
//   ORGANIZER_EMAIL=... ORGANIZER_PASSWORD=... \
//   node infra/scripts/build-store-screenshots.mjs <prod-tournament-slug> <prod-team-id>
// Optional: HTTPS_PROXY (corporate proxy, used for production calls),
// PROD_URL (default https://tournarena.com).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.env.MOBILE_URL ?? 'http://localhost:4400';
const LOCAL_API = process.env.LOCAL_API ?? 'http://localhost:3001';
const PROD = process.env.PROD_URL ?? 'https://tournarena.com';
const [SLUG, TEAM_ID] = process.argv.slice(2);
if (!SLUG || !TEAM_ID) {
  console.error('Usage: node infra/scripts/build-store-screenshots.mjs <slug> <team-id>');
  process.exit(1);
}

const STORE = join(REPO_ROOT, 'apps', 'mobile', 'store-assets', 'app-store');
const RAW = join(tmpdir(), 'tournarena-store-raw');

// Raw app capture viewport, then final canvas (CSS px x scale = pixels).
const DEVICES = {
  iphone: {
    capture: { width: 390, height: 844, deviceScaleFactor: 3 },
    canvas: { width: 414, height: 896, deviceScaleFactor: 3 }, // 1242x2688 (6.5")
    outDir: join(STORE, 'screenshots-6.5in'),
    frameWidth: 318,
    radius: 44,
  },
  ipad: {
    capture: { width: 820, height: 1180, deviceScaleFactor: 2 },
    canvas: { width: 1032, height: 1376, deviceScaleFactor: 2 }, // 2064x2752 (13")
    outDir: join(STORE, 'screenshots-ipad-13in'),
    frameWidth: 760,
    radius: 36,
  },
};

const SCREENS = [
  {
    name: '1-tournoi',
    path: `/${SLUG}`,
    title: 'Votre tournoi en direct',
    subtitle: 'Lieu, date et matchs réunis au même endroit',
  },
  {
    name: '2-matchs',
    path: `/${SLUG}/schedule`,
    title: 'Tous les matchs en un coup d’œil',
    subtitle: 'À venir, en cours, terminés',
  },
  {
    name: '3-classement',
    path: `/${SLUG}/standings`,
    title: 'Classements automatiques',
    subtitle: 'Mis à jour à chaque score',
  },
  {
    name: '4-equipe',
    path: `/${SLUG}/team/${TEAM_ID}`,
    title: 'Suivez votre équipe',
    subtitle: 'Prochain match et classement de poule',
  },
  {
    name: '5-creation',
    path: '/organizer/tournaments/new-plateau',
    organizer: true,
    title: 'Créez un événement en 2 minutes',
    subtitle: 'Poules, phase finale et calendrier générés',
  },
];

function proxyOption() {
  const server = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  return server ? { server, bypass: 'localhost,127.0.0.1' } : undefined;
}

/** Public data + uploads come from production; the live SSE stream is dropped. */
async function routeToProduction(context) {
  const api = new URL(LOCAL_API);
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.host !== api.host) {
      return route.continue();
    }
    if (url.pathname.endsWith('/events')) {
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/v1/public') && !url.pathname.startsWith('/uploads')) {
      return route.continue();
    }
    const response = await route.fetch({ url: `${PROD}${url.pathname}${url.search}` });
    return route.fulfill({ response });
  });
}

/** Logs in and lands on `path` through the app's own returnUrl -- a full reload would drop the session. */
async function loginOrganizer(page, path) {
  const { ORGANIZER_EMAIL, ORGANIZER_PASSWORD } = process.env;
  if (!ORGANIZER_EMAIL || !ORGANIZER_PASSWORD) {
    throw new Error('ORGANIZER_EMAIL / ORGANIZER_PASSWORD are required for the organizer screen.');
  }
  await page.goto(`${BASE}/organizer/login?returnUrl=${encodeURIComponent(path)}`, {
    waitUntil: 'networkidle',
  });
  await page.fill('input[type=email]', ORGANIZER_EMAIL);
  await page.fill('input[type=password]', ORGANIZER_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => url.pathname === path);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** The quick event form, filled like the showcase tournament. */
async function fillQuickEvent(page) {
  await page.getByLabel(/Nom du/).fill('Plateau U11 ES Milloise - Toussaint');
  await page.getByLabel('Catégorie').selectOption('U11');
  await page.getByLabel('Date', { exact: true }).fill('2026-11-11');
  await page.getByLabel('Premier match').fill('10:30');
  await page.getByLabel('Équipes', { exact: true }).fill('8');
  await page.getByLabel('Poules', { exact: true }).fill('2');
  await page.getByLabel('Phase finale').selectOption('4');
  // Picks the address suggestion (no spinner or open list left on screen);
  // keeps the typed name if the search doesn't answer in time.
  const venue = page.locator('ap-autocomplete-field input');
  await venue.fill('Stade Marius Requier');
  const option = page.locator('[role="option"]').first();
  try {
    await option.waitFor({ timeout: 8000 });
    await option.dispatchEvent('mousedown');
  } catch {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(800);
  await venue.blur();
}

async function captureRaw(browser, device) {
  const context = await browser.newContext({
    viewport: { width: device.capture.width, height: device.capture.height },
    deviceScaleFactor: device.capture.deviceScaleFactor,
    isMobile: device === DEVICES.iphone,
    hasTouch: true,
    colorScheme: 'light',
    locale: 'fr-FR',
    proxy: proxyOption(),
  });
  await routeToProduction(context);
  const page = await context.newPage();
  const files = {};
  for (const screen of SCREENS) {
    if (screen.organizer) {
      await loginOrganizer(page, screen.path);
      await fillQuickEvent(page);
    } else {
      await page.goto(`${BASE}${screen.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
    }
    await page.waitForTimeout(1500);
    const file = join(RAW, `${device === DEVICES.iphone ? 'iphone' : 'ipad'}-${screen.name}.png`);
    await page.screenshot({ path: file });
    files[screen.name] = file;
    console.log(`captured ${file}`);
  }
  await context.close();
  return files;
}

function composeHtml(screen, device, imageDataUrl) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${device.canvas.width}px; height: ${device.canvas.height}px; }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    color: #fff;
    overflow: hidden;
    background:
      radial-gradient(120% 60% at 85% 0%, rgba(255, 214, 102, 0.28), transparent 60%),
      radial-gradient(90% 50% at 0% 100%, rgba(52, 211, 153, 0.35), transparent 60%),
      linear-gradient(160deg, #052e1f 0%, #0b5a37 55%, #14804a 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: ${device === DEVICES.iphone ? 64 : 90}px;
  }
  .brand {
    font-size: ${device === DEVICES.iphone ? 13 : 18}px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #a7f3d0;
  }
  h1 {
    margin-top: 12px;
    max-width: 90%;
    text-align: center;
    font-size: ${device === DEVICES.iphone ? 34 : 54}px;
    line-height: 1.08;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  p {
    margin-top: 12px;
    text-align: center;
    font-size: ${device === DEVICES.iphone ? 17 : 26}px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.82);
  }
  .frame {
    margin-top: ${device === DEVICES.iphone ? 36 : 56}px;
    width: ${device.frameWidth}px;
    padding: ${device === DEVICES.iphone ? 10 : 14}px;
    border-radius: ${device.radius + 10}px;
    background: #0b0f14;
    box-shadow: 0 40px 80px rgba(0, 0, 0, 0.45), 0 0 0 2px rgba(255, 255, 255, 0.08);
  }
  .frame img {
    display: block;
    width: 100%;
    border-radius: ${device.radius}px;
  }
</style></head><body>
  <div class="brand">TournArena</div>
  <h1>${screen.title}</h1>
  <p>${screen.subtitle}</p>
  <div class="frame"><img src="${imageDataUrl}" alt=""></div>
</body></html>`;
}

async function compose(browser, device, rawFiles) {
  mkdirSync(device.outDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: device.canvas.width, height: device.canvas.height },
    deviceScaleFactor: device.canvas.deviceScaleFactor,
    proxy: proxyOption(),
  });
  const page = await context.newPage();
  for (const screen of SCREENS) {
    const data = readFileSync(rawFiles[screen.name]).toString('base64');
    const html = join(RAW, 'compose.html');
    writeFileSync(html, composeHtml(screen, device, `data:image/png;base64,${data}`));
    await page.goto(`file://${html.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
    const out = join(device.outDir, `${screen.name}.png`);
    await page.screenshot({ path: out });
    console.log(`composed ${out}`);
  }
  await context.close();
}

mkdirSync(RAW, { recursive: true });
const browser = await chromium.launch();
try {
  for (const device of Object.values(DEVICES)) {
    const raw = await captureRaw(browser, device);
    await compose(browser, device, raw);
  }
} finally {
  await browser.close();
}
