#!/usr/bin/env node
// Prints the marketing version (CFBundleShortVersionString) deploy-ios.yml
// must upload under, so nobody has to bump it by hand each time Apple closes
// a TestFlight train (error 90186/90062) -- see lib/ios-version.mjs for the
// rule. Same zero-dependency App Store Connect auth as
// submit-ios-app-store.mjs (ES256 JWT over the .p8 key, Node's crypto).
//
// Usage (env vars, same secrets as deploy-ios.yml):
//   APP_STORE_CONNECT_API_KEY_BASE64, APP_STORE_CONNECT_KEY_ID,
//   APP_STORE_CONNECT_ISSUER_ID, BUNDLE_ID=com.arenapulse.mobile
//
// Writes `version=<x.y>` to $GITHUB_OUTPUT when set, and always logs the
// decision.

import { appendFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { resolveMarketingVersion } from './lib/ios-version.mjs';

const {
  APP_STORE_CONNECT_API_KEY_BASE64,
  APP_STORE_CONNECT_KEY_ID,
  APP_STORE_CONNECT_ISSUER_ID,
  BUNDLE_ID,
  GITHUB_OUTPUT,
} = process.env;

for (const [name, value] of Object.entries({
  APP_STORE_CONNECT_API_KEY_BASE64,
  APP_STORE_CONNECT_KEY_ID,
  APP_STORE_CONNECT_ISSUER_ID,
  BUNDLE_ID,
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

// Same as submit-ios-app-store.mjs's buildJwt.
function buildJwt(privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    JSON.stringify({ alg: 'ES256', kid: APP_STORE_CONNECT_KEY_ID, typ: 'JWT' }),
  );
  const claims = base64url(
    JSON.stringify({
      iss: APP_STORE_CONNECT_ISSUER_ID,
      iat: now,
      exp: now + 1200,
      aud: 'appstoreconnect-v1',
    }),
  );
  const signer = createSign('sha256');
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = base64url(signer.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' }));
  return `${header}.${claims}.${signature}`;
}

async function get(jwt, path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  const privateKeyPem = Buffer.from(APP_STORE_CONNECT_API_KEY_BASE64, 'base64').toString('utf8');
  const jwt = buildJwt(privateKeyPem);

  const apps = await get(jwt, `/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`);
  const appId = apps.data?.[0]?.id;
  if (!appId) {
    throw new Error(`No app found for bundle ID "${BUNDLE_ID}" in App Store Connect.`);
  }

  const [versions, trains] = await Promise.all([
    get(jwt, `/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=200`),
    get(jwt, `/preReleaseVersions?filter[app]=${appId}&filter[platform]=IOS&limit=200`),
  ]);

  const { version, reason } = resolveMarketingVersion({
    storeVersions: versions.data.map((v) => ({
      versionString: v.attributes.versionString,
      // appVersionState replaces the deprecated appStoreState.
      state: v.attributes.appVersionState ?? v.attributes.appStoreState,
    })),
    trainVersions: trains.data.map((t) => t.attributes.version),
  });

  console.log(`Marketing version: ${version} (${reason})`);
  if (GITHUB_OUTPUT) {
    appendFileSync(GITHUB_OUTPUT, `version=${version}\n`);
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
