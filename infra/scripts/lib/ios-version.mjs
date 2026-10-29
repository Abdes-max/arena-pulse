// Picks the CFBundleShortVersionString a new TestFlight upload must use,
// from what App Store Connect already knows about the app. Pure (no I/O) so
// resolve-ios-marketing-version.mjs stays a thin API wrapper around it.
//
// Apple ties TestFlight builds to a "pre-release train" per marketing
// version, and closes that train for good once a build under it is
// submitted for App Store review (error 90186/90062 on any later upload).
// So: keep uploading to the highest known version while its App Store
// version is still editable (or doesn't exist yet), otherwise move to the
// next minor version.

// App Store version states where the version hasn't been (or is no longer)
// in Apple's hands -- its train still accepts new builds.
const OPEN_STATES = new Set([
  'PREPARE_FOR_SUBMISSION',
  'READY_FOR_REVIEW',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
]);

function parse(version) {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function nextMinor(version) {
  const [major = 1, minor = 0] = parse(version);
  return `${major}.${minor + 1}`;
}

/**
 * @param {{ storeVersions: { versionString: string, state: string }[], trainVersions: string[], fallback?: string }} input
 * @returns {{ version: string, reason: string }}
 */
export function resolveMarketingVersion({ storeVersions, trainVersions, fallback = '1.0' }) {
  const all = [...storeVersions.map((v) => v.versionString), ...trainVersions];
  if (all.length === 0) {
    return { version: fallback, reason: 'no version in App Store Connect yet' };
  }
  const highest = all.reduce((max, v) => (compareVersions(v, max) > 0 ? v : max));
  const store = storeVersions.find((v) => compareVersions(v.versionString, highest) === 0);
  if (store && !OPEN_STATES.has(store.state)) {
    return {
      version: nextMinor(highest),
      reason: `${highest} is ${store.state} on the App Store, its train is closed`,
    };
  }
  return {
    version: highest,
    reason: store ? `${highest} is still ${store.state}` : `${highest} is TestFlight-only so far`,
  };
}
