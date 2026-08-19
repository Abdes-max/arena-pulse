#!/usr/bin/env node
// Promotes an already-uploaded, already-tested release from one Play
// Console track to another (internal -> production by default) WITHOUT
// rebuilding or re-uploading a binary -- the exact .aab that testers ran on
// the internal track is the one that goes to production, never a fresh
// build that merely claims to be the same thing.
//
// Deliberately zero new npm dependencies: the Play Developer Publishing API
// is plain REST, and the OAuth2 JWT-bearer exchange for a service account
// only needs RS256 signing, which Node's built-in `crypto` module already
// does -- no `googleapis` package (a very large dependency for what's a
// handful of REST calls), same "avoid Fastlane, use native tooling" stance
// as deploy-android.yml/deploy-ios.yml (see their own header comments).
//
// Usage (all via env vars, matching this repo's other infra/scripts/*.mjs):
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<json>  (required -- same secret used by deploy-android.yml)
//   PACKAGE_NAME=com.arenapulse.mobile        (required)
//   SOURCE_TRACK=internal                     (optional, default: internal)
//   TARGET_TRACK=production                   (optional, default: production)
//   VERSION_CODE=42                           (optional -- defaults to the
//                                               most recent release found on
//                                               SOURCE_TRACK)
//   ROLLOUT_FRACTION=1.0                      (optional, default: 1.0 --
//                                               fraction of users to roll
//                                               out to immediately; e.g. 0.1
//                                               for a 10% staged rollout,
//                                               increased in a later run)
//
// node infra/scripts/promote-android-release.mjs

import { createSign } from 'node:crypto';

const {
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
  PACKAGE_NAME,
  SOURCE_TRACK = 'internal',
  TARGET_TRACK = 'production',
  VERSION_CODE,
  ROLLOUT_FRACTION = '1.0',
} = process.env;

if (!GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
  console.error('✗ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is required.');
  process.exit(1);
}
if (!PACKAGE_NAME) {
  console.error('✗ PACKAGE_NAME is required.');
  process.exit(1);
}

const rolloutFraction = Number(ROLLOUT_FRACTION);
if (!(rolloutFraction > 0 && rolloutFraction <= 1)) {
  console.error(`✗ ROLLOUT_FRACTION must be a number in (0, 1], got "${ROLLOUT_FRACTION}".`);
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Service-account JWT-bearer OAuth2 flow -- https://developers.google.com/identity/protocols/oauth2/service-account#jwt-auth */
async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = base64url(signer.sign(serviceAccount.private_key));
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const { access_token: accessToken } = await res.json();
  return accessToken;
}

async function api(accessToken, method, path, body) {
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
  const serviceAccount = JSON.parse(GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  console.log(`Authenticating as ${serviceAccount.client_email}...`);
  const accessToken = await getAccessToken(serviceAccount);

  const base = `/applications/${encodeURIComponent(PACKAGE_NAME)}`;

  console.log('Opening an edit...');
  const edit = await api(accessToken, 'POST', `${base}/edits`);
  const editId = edit.id;

  console.log(`Reading the current "${SOURCE_TRACK}" track...`);
  const sourceTrack = await api(
    accessToken,
    'GET',
    `${base}/edits/${editId}/tracks/${SOURCE_TRACK}`,
  );
  const releases = sourceTrack.releases ?? [];
  if (releases.length === 0) {
    throw new Error(`No releases found on track "${SOURCE_TRACK}" -- nothing to promote.`);
  }

  let release;
  if (VERSION_CODE) {
    const target = Number(VERSION_CODE);
    release = releases.find((r) => (r.versionCodes ?? []).map(Number).includes(target));
    if (!release) {
      throw new Error(
        `versionCode ${target} not found on track "${SOURCE_TRACK}". ` +
          `Available releases: ${JSON.stringify(releases.map((r) => r.versionCodes))}`,
      );
    }
  } else {
    // Play Console returns releases most-recent-first; take the first one
    // that actually has version codes (defensive -- draft/empty entries
    // exist in principle even if unlikely here).
    release = releases.find((r) => (r.versionCodes ?? []).length > 0);
    if (!release) {
      throw new Error(`No release with version codes found on track "${SOURCE_TRACK}".`);
    }
  }
  console.log(
    `Promoting versionCode(s) ${release.versionCodes.join(', ')} ` +
      `from "${SOURCE_TRACK}" to "${TARGET_TRACK}" (rollout: ${rolloutFraction * 100}%)...`,
  );

  const targetRelease = {
    versionCodes: release.versionCodes,
    status: rolloutFraction < 1 ? 'inProgress' : 'completed',
    ...(rolloutFraction < 1 ? { userFraction: rolloutFraction } : {}),
    ...(release.releaseNotes ? { releaseNotes: release.releaseNotes } : {}),
  };

  await api(accessToken, 'PUT', `${base}/edits/${editId}/tracks/${TARGET_TRACK}`, {
    releases: [targetRelease],
  });

  console.log('Committing the edit...');
  await api(accessToken, 'POST', `${base}/edits/${editId}:commit`);

  console.log(`✓ versionCode(s) ${release.versionCodes.join(', ')} promoted to "${TARGET_TRACK}".`);
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
