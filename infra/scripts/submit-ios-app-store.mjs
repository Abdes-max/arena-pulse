#!/usr/bin/env node
// Submits an already-uploaded, already-tested TestFlight build for App
// Store review -- the exact .ipa testers ran, never a fresh archive. Unlike
// Android's track promotion, Apple has no separate "production artifact":
// the same build just gets attached to an App Store version and submitted.
//
// Deliberately zero new npm dependencies, same reasoning as
// promote-android-release.mjs: the App Store Connect API is plain REST, and
// its JWT auth only needs ES256 signing over the same .p8 key already used
// by deploy-ios.yml -- Node's built-in `crypto` module handles that
// (`dsaEncoding: 'ieee-p1363'` gets the raw R||S format JWT needs, not the
// DER format crypto.sign returns by default for EC keys).
//
// This is a real submission for Apple review -- it will fail loudly (not
// silently guess) if the app's store listing (screenshots, description,
// age rating, App Privacy answers, etc.) isn't already complete in App
// Store Connect, since Apple itself rejects an incomplete version at
// submission time. Filling in that listing is a one-time manual step in
// App Store Connect's own UI, not something this script attempts.
//
// Usage (all via env vars, matching this repo's other infra/scripts/*.mjs):
//   APP_STORE_CONNECT_API_KEY_BASE64  (required -- same secret as deploy-ios.yml)
//   APP_STORE_CONNECT_KEY_ID          (required)
//   APP_STORE_CONNECT_ISSUER_ID       (required)
//   BUNDLE_ID=com.arenapulse.mobile   (required)
//   VERSION_STRING=1.0                (required -- the marketing version,
//                                       e.g. "1.0"; must match/extend what's
//                                       already in App Store Connect)
//   BUILD_NUMBER=42                   (optional -- defaults to the most
//                                       recently processed TestFlight build)
//   RELEASE_NOTES="..."               (optional -- "What's New" text for the
//                                       en-US localization; skipped if the
//                                       version already has one)
//   RELEASE_TYPE=MANUAL               (optional, default MANUAL -- MANUAL
//                                       means approval doesn't auto-publish;
//                                       release stays a deliberate separate
//                                       step in App Store Connect. AFTER_APPROVAL
//                                       publishes immediately on approval.)
//
// node infra/scripts/submit-ios-app-store.mjs

import { createSign } from 'node:crypto';

const {
  APP_STORE_CONNECT_API_KEY_BASE64,
  APP_STORE_CONNECT_KEY_ID,
  APP_STORE_CONNECT_ISSUER_ID,
  BUNDLE_ID,
  VERSION_STRING,
  BUILD_NUMBER,
  RELEASE_NOTES,
  RELEASE_TYPE = 'MANUAL',
} = process.env;

for (const [name, value] of Object.entries({
  APP_STORE_CONNECT_API_KEY_BASE64,
  APP_STORE_CONNECT_KEY_ID,
  APP_STORE_CONNECT_ISSUER_ID,
  BUNDLE_ID,
  VERSION_STRING,
})) {
  if (!value) {
    console.error(`✗ ${name} is required.`);
    process.exit(1);
  }
}

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** App Store Connect API JWT -- https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests */
function buildJwt(privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    JSON.stringify({ alg: 'ES256', kid: APP_STORE_CONNECT_KEY_ID, typ: 'JWT' }),
  );
  const claims = base64url(
    JSON.stringify({
      iss: APP_STORE_CONNECT_ISSUER_ID,
      iat: now,
      exp: now + 1200, // Apple caps this token type at 20 minutes.
      aud: 'appstoreconnect-v1',
    }),
  );
  const signer = createSign('sha256');
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = base64url(signer.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' }));
  return `${header}.${claims}.${signature}`;
}

async function api(jwt, method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  const privateKeyPem = Buffer.from(APP_STORE_CONNECT_API_KEY_BASE64, 'base64').toString('utf8');
  const jwt = buildJwt(privateKeyPem);

  console.log(`Looking up the app for bundle ID "${BUNDLE_ID}"...`);
  const apps = await api(jwt, 'GET', `/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`);
  const app = apps.data?.[0];
  if (!app) {
    throw new Error(`No app found for bundle ID "${BUNDLE_ID}" in App Store Connect.`);
  }
  const appId = app.id;

  console.log(
    BUILD_NUMBER
      ? `Looking up build ${BUILD_NUMBER}...`
      : 'Looking up the most recently processed build...',
  );
  const buildFilter = BUILD_NUMBER ? `&filter[version]=${encodeURIComponent(BUILD_NUMBER)}` : '';
  const builds = await api(
    jwt,
    'GET',
    `/builds?filter[app]=${appId}&filter[processingState]=VALID${buildFilter}&sort=-uploadedDate&limit=1`,
  );
  const build = builds.data?.[0];
  if (!build) {
    throw new Error(
      BUILD_NUMBER
        ? `No processed (VALID) build ${BUILD_NUMBER} found -- it may still be processing, or the number is wrong.`
        : 'No processed (VALID) build found at all -- upload one via deploy-ios.yml first and wait for TestFlight processing to finish.',
    );
  }
  console.log(`  → using build ${build.attributes.version} (id ${build.id})`);

  console.log(`Looking for an existing App Store version "${VERSION_STRING}"...`);
  const versions = await api(
    jwt,
    'GET',
    `/apps/${appId}/appStoreVersions?filter[versionString]=${encodeURIComponent(VERSION_STRING)}&filter[platform]=IOS`,
  );
  let version = versions.data?.[0];

  if (version) {
    const state = version.attributes.appStoreState;
    // Any state other than these means the version is already submitted,
    // in review, or live -- attaching a different build or re-submitting
    // would either fail outright or silently do nothing useful. Fail
    // loudly instead of guessing what the caller meant.
    const editableStates = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'];
    if (!editableStates.includes(state)) {
      throw new Error(
        `App Store version "${VERSION_STRING}" already exists in state "${state}" -- ` +
          'not safe to modify/resubmit automatically. Use a new VERSION_STRING, or ' +
          'resolve the existing version manually in App Store Connect first.',
      );
    }
    console.log(`  → found existing version in state "${state}", reusing it.`);
  } else {
    console.log('  → none found, creating a new one.');
    const created = await api(jwt, 'POST', '/appStoreVersions', {
      data: {
        type: 'appStoreVersions',
        attributes: { platform: 'IOS', versionString: VERSION_STRING, releaseType: RELEASE_TYPE },
        relationships: { app: { data: { type: 'apps', id: appId } } },
      },
    });
    version = created.data;
  }

  console.log(`Attaching build ${build.attributes.version} to the version...`);
  await api(jwt, 'PATCH', `/appStoreVersions/${version.id}/relationships/build`, {
    data: { type: 'builds', id: build.id },
  });

  if (RELEASE_NOTES) {
    console.log('Setting release notes (en-US)...');
    const localizations = await api(
      jwt,
      'GET',
      `/appStoreVersions/${version.id}/appStoreVersionLocalizations?filter[locale]=en-US`,
    );
    const localization = localizations.data?.[0];
    if (localization) {
      await api(jwt, 'PATCH', `/appStoreVersionLocalizations/${localization.id}`, {
        data: {
          type: 'appStoreVersionLocalizations',
          id: localization.id,
          attributes: { whatsNew: RELEASE_NOTES },
        },
      });
    } else {
      console.warn(
        '  ⚠ no en-US localization found on this version yet -- skipping release notes. ' +
          'Create the store listing localization in App Store Connect first.',
      );
    }
  }

  console.log('Submitting for review...');
  await api(jwt, 'POST', '/appStoreVersionSubmissions', {
    data: {
      type: 'appStoreVersionSubmissions',
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
    },
  });

  console.log(
    `✓ Version ${VERSION_STRING} (build ${build.attributes.version}) submitted for review. ` +
      `Track status at https://appstoreconnect.apple.com/apps/${appId}/appstore`,
  );
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
