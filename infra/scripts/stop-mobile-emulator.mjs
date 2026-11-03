#!/usr/bin/env node
// Stops what `npm run emulator:mobile` started: the Android emulator and the
// `ng serve mobile` dev server it spawned. Doesn't touch the API or Docker
// infrastructure (that's `npm run stop`) -- this only tears down the
// emulator-specific pieces. Safe to re-run: anything already gone is skipped.
import { connectedEmulatorId, killPort, resolveAndroidSdk, run } from './lib/android.mjs';

const MOBILE_PORT = 4400;

async function main() {
  const sdk = resolveAndroidSdk();

  console.log('1/2 — Android emulator');
  if (!sdk) {
    console.log('  → ANDROID_HOME/ANDROID_SDK_ROOT not set — nothing to do.');
  } else {
    const deviceId = connectedEmulatorId(sdk.adb);
    if (!deviceId) {
      console.log('  → no emulator running — nothing to do.');
    } else {
      console.log(`  → stopping ${deviceId}...`);
      run(sdk.adb, ['-s', deviceId, 'emu', 'kill']);
    }
  }

  console.log('2/2 — Mobile dev server (ng serve mobile)');
  console.log(
    killPort(MOBILE_PORT)
      ? `  → stopped (was on port ${MOBILE_PORT}).`
      : '  → was not running — nothing to do.',
  );

  console.log('\nMobile emulator stopped. Note: environment.development.ts / capacitor.config.ts');
  console.log(
    'may still be showing an API_PORT override from a previous run -- check "git status"',
  );
  console.log('in apps/mobile if so.');
}

main();
