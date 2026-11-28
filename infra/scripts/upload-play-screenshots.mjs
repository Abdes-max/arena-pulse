#!/usr/bin/env node
// Replaces the Google Play store listing's screenshots with the ones
// committed by build-store-screenshots.mjs, for every language the listing
// has -- the same sets as the App Store: phone (store-assets/play/screenshots,
// as the iPhone ones) and tablet 7" / 10" (the iPad ones).
//
// Only touches the listing images: no track, no release, no tester list --
// a running closed test (and its 14-day count) is left as it is.
//
// Env: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, PACKAGE_NAME, optional
// SCREENSHOTS_DIR (phone, default apps/mobile/store-assets/play/screenshots),
// TABLET_SCREENSHOTS_DIR (default .../app-store/screenshots-ipad-13in),
// DRY_RUN=true to only list what would be uploaded.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, getAccessToken } from './lib/play-api.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const {
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
  PACKAGE_NAME,
  SCREENSHOTS_DIR = join(REPO_ROOT, 'apps', 'mobile', 'store-assets', 'play', 'screenshots'),
  TABLET_SCREENSHOTS_DIR = join(
    REPO_ROOT,
    'apps',
    'mobile',
    'store-assets',
    'app-store',
    'screenshots-ipad-13in',
  ),
  DRY_RUN,
} = process.env;
const dryRun = DRY_RUN === 'true';

if (!GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || !PACKAGE_NAME) {
  console.error('✗ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON and PACKAGE_NAME are required.');
  process.exit(1);
}

/** Media upload (the JSON `api` helper only sends JSON bodies). */
async function uploadImage(accessToken, path, file) {
  const res = await fetch(
    `https://androidpublisher.googleapis.com/upload/androidpublisher/v3${path}?uploadType=media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/png' },
      body: readFileSync(file),
    },
  );
  if (!res.ok) {
    throw new Error(`Upload of ${file} failed: ${res.status} ${await res.text()}`);
  }
}

/** A folder's PNGs, sorted so the store order follows the file names (1-…, 2-…). */
function pngs(dir) {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .sort()
    .map((name) => join(dir, name));
  if (files.length < 2 || files.length > 8) {
    throw new Error(
      `Google Play wants 2 to 8 screenshots per type, found ${files.length} in ${dir}.`,
    );
  }
  return files;
}

async function main() {
  const tablet = pngs(TABLET_SCREENSHOTS_DIR);
  // Image type -> its files (the App Store's iPhone and iPad sets).
  const sets = {
    phoneScreenshots: pngs(SCREENSHOTS_DIR),
    sevenInchScreenshots: tablet,
    tenInchScreenshots: tablet,
  };

  const serviceAccount = JSON.parse(GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  console.log(`Authenticating as ${serviceAccount.client_email}...`);
  const accessToken = await getAccessToken(serviceAccount);
  const base = `/applications/${PACKAGE_NAME}`;

  const edit = await api(accessToken, 'POST', `${base}/edits`);
  const editId = edit.id;
  const { listings = [] } = await api(accessToken, 'GET', `${base}/edits/${editId}/listings`);
  const languages = listings.map((listing) => listing.language);
  console.log(`Listing languages: ${languages.join(', ') || '(none)'}`);
  if (!languages.length) {
    throw new Error('The app has no store listing yet -- create it in Play Console first.');
  }

  if (dryRun) {
    for (const [type, files] of Object.entries(sets)) {
      files.forEach((file) => console.log(`  ${type}: would upload ${file}`));
    }
    await api(accessToken, 'DELETE', `${base}/edits/${editId}`);
    console.log('✓ Dry run: nothing changed.');
    return;
  }

  for (const language of languages) {
    for (const [type, files] of Object.entries(sets)) {
      const path = `${base}/edits/${editId}/listings/${language}/${type}`;
      console.log(`[${language}] ${type}: removing the current ones...`);
      await api(accessToken, 'DELETE', path);
      for (const file of files) {
        await uploadImage(accessToken, path, file);
        console.log(`[${language}] ${type}: uploaded ${file}`);
      }
    }
  }

  await api(accessToken, 'POST', `${base}/edits/${editId}:commit`);
  const counts = Object.entries(sets)
    .map(([type, files]) => `${files.length} ${type}`)
    .join(', ');
  console.log(`✓ Screenshots replaced: ${counts} (${languages.join(', ')}).`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
