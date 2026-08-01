#!/usr/bin/env node
// Builds and launches apps/mobile on a local Android emulator, wired up to
// live-reload from `ng serve mobile` and talk to the already-running dev API.
// Worked out by hand once (see PR #26's testing) and fiddly enough to script:
//
//  - Boots an AVD if none is already running.
//  - Starts `ng serve mobile` bound to 0.0.0.0 -- Angular's Vite-based dev
//    server binds IPv6-loopback-only by default, which the IPv4 connection
//    behind `adb reverse` can't reach (silently hangs, not even refused).
//  - `adb reverse`s the mobile dev-server port and the API port from the
//    emulator's own "localhost" to this machine. 10.0.2.2 (the usual
//    emulator-to-host alias) was tried first and hung against this dev
//    server for reasons never fully isolated -- adb reverse is the more
//    reliable path and matches how a real USB-attached device is set up too.
//  - Temporarily points capacitor.config.ts's server.url at the live dev
//    server (with cleartext enabled, since it's plain http), restoring the
//    original content right after the native build -- it must be in place
//    *before* `cap sync`, not patched into the generated output afterwards,
//    since cleartext also flips an AndroidManifest.xml flag that `cap sync`
//    only (re)writes from the .ts source at sync time.
//  - Points environment.development.ts's apiUrl at the reverse-forwarded API
//    port. Unlike capacitor.config.ts this is *not* auto-reverted: `ng serve
//    mobile` reads it live for as long as it keeps running, which is the
//    whole point of live-reload, so restoring it while that process is up
//    would just get overwritten by the next rebuild anyway. With the default
//    API_PORT (3000, matching the file's own tracked default) this is a
//    no-op and the file never actually changes. It only stays modified when
//    API_PORT is overridden -- same manual-revert discipline already used
//    for apps/web's analogous local port overrides (git checkout it once
//    you're done testing on the emulator).
//  - Builds the debug APK with the Gradle wrapper directly -- `npx cap run
//    android` failed to invoke gradlew.bat from this shell (Windows-only
//    quirk: Node couldn't resolve the .bat without going through cmd.exe).
//  - Always (re)starts `ng serve mobile` fresh *after* the libs rebuild, never
//    reuses one left over from an earlier run: an already-running instance
//    watching dist/* caught a rebuild mid-write once and got its Vite
//    dependency pre-bundle wedged on a stale copy of realtime-client, which
//    then only showed up as a "Cannot find module" error in the WebView.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isPortInUse, waitForPort, fetchMatches } from './lib/ports.mjs';
import {
  isWin,
  resolveAndroidSdk,
  run,
  runCapture,
  connectedEmulatorId as connectedEmulatorIdFor,
  killPort,
} from './lib/android.mjs';

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');
const mobileDir = path.join(rootDir, 'apps/mobile');
const androidDir = path.join(mobileDir, 'android');
const envDevFile = path.join(mobileDir, 'src/environments/environment.development.ts');
const capacitorConfigFile = path.join(mobileDir, 'capacitor.config.ts');

const APP_ID = 'com.arenapulse.mobile';
const MOBILE_PORT = 4400;
const API_PORT = Number(process.env.API_PORT) || 3000;
const AVD_NAME = process.env.AVD_NAME; // optional -- defaults to the first AVD found

const sdk = resolveAndroidSdk();
if (!sdk) {
  console.error(
    "ANDROID_HOME/ANDROID_SDK_ROOT is not set. Install Android Studio's SDK and create an AVD first.",
  );
  process.exit(1);
}
const { adb, emulatorBin } = sdk;
const connectedEmulatorId = () => connectedEmulatorIdFor(adb);

async function ensureEmulatorRunning() {
  const alreadyRunning = connectedEmulatorId();
  if (alreadyRunning) {
    console.log(`✓ Emulator already running (${alreadyRunning}).`);
    return alreadyRunning;
  }

  const avds = (runCapture(emulatorBin, ['-list-avds']).stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const avd = AVD_NAME || avds[0];
  if (!avd) {
    console.error('No Android Virtual Device found. Create one in Android Studio first.');
    process.exit(1);
  }
  console.log(`  → booting AVD "${avd}"...`);
  const child = spawn(emulatorBin, ['-avd', avd, '-no-snapshot-load'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  console.log('  → waiting for device...');
  run(adb, ['wait-for-device']);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const booted = runCapture(adb, ['shell', 'getprop', 'sys.boot_completed']).stdout?.trim();
    if (booted === '1') break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const id = connectedEmulatorId();
  if (!id) {
    console.error('Emulator did not finish booting in time.');
    process.exit(1);
  }
  console.log(`✓ Emulator booted (${id}).`);
  return id;
}

/** Always restarts fresh -- see the file-header note on why reusing a stale instance is unsafe here. */
async function startMobileDevServer() {
  if (await isPortInUse(MOBILE_PORT)) {
    if (!(await fetchMatches(MOBILE_PORT, '/', '<title>Mobile</title>'))) {
      console.error(`✗ Port ${MOBILE_PORT} is in use by something else — stop it first.`);
      process.exit(1);
    }
    console.log(`  → restarting ng serve mobile (picking up the just-built libs)...`);
    killPort(MOBILE_PORT);
  }
  console.log('  → starting ng serve mobile (bound to 0.0.0.0 for the emulator)...');
  const child = spawn(
    'npx',
    ['ng', 'serve', 'mobile', '--port', String(MOBILE_PORT), '--host', '0.0.0.0'],
    { cwd: rootDir, shell: isWin, detached: true, stdio: 'ignore' },
  );
  child.unref();
  const ready = await waitForPort(MOBILE_PORT, 60_000);
  if (!ready) {
    console.error('ng serve mobile did not come up in time.');
    process.exit(1);
  }
  console.log(`✓ ng serve mobile ready on port ${MOBILE_PORT}.`);
}

async function ensureApi() {
  if (await isPortInUse(API_PORT)) {
    if (await fetchMatches(API_PORT, '/api/v1', 'Hello World')) {
      console.log(`✓ API already running on port ${API_PORT}.`);
      return;
    }
  }
  console.error(
    `✗ No Arena Pulse API detected on port ${API_PORT}. Start it first with "npm run run" ` +
      `(or set API_PORT=<port> if it's running somewhere else).`,
  );
  process.exit(1);
}

async function main() {
  console.log('1/6 — Android emulator');
  const deviceId = await ensureEmulatorRunning();

  console.log('2/6 — API');
  await ensureApi();

  console.log('3/6 — adb reverse (emulator "localhost" → this machine)');
  run(adb, ['-s', deviceId, 'reverse', `tcp:${MOBILE_PORT}`, `tcp:${MOBILE_PORT}`]);
  run(adb, ['-s', deviceId, 'reverse', `tcp:${API_PORT}`, `tcp:${API_PORT}`]);

  console.log('4/6 — Building the debug APK');
  const originalEnvDev = readFileSync(envDevFile, 'utf8');
  const patchedEnvDev = originalEnvDev.replace(
    /apiUrl:\s*'[^']*'/,
    `apiUrl: 'http://localhost:${API_PORT}/api/v1'`,
  );
  writeFileSync(envDevFile, patchedEnvDev);
  if (patchedEnvDev !== originalEnvDev) {
    console.log(
      `  (environment.development.ts now points at :${API_PORT} for ng serve mobile — ` +
        'revert it with "git checkout apps/mobile/src/environments/environment.development.ts" once done)',
    );
  }

  const originalCapacitorConfig = readFileSync(capacitorConfigFile, 'utf8');
  try {
    writeFileSync(
      capacitorConfigFile,
      originalCapacitorConfig.replace(
        /};\s*\n\s*export default config;/,
        `  server: { url: 'http://localhost:${MOBILE_PORT}', cleartext: true },\n};\n\nexport default config;`,
      ),
    );

    if (run('npm', ['run', 'build:libs'], { cwd: rootDir }).status !== 0) {
      throw new Error('build:libs failed');
    }
    if (run('npx', ['ng', 'build', 'mobile'], { cwd: rootDir }).status !== 0) {
      throw new Error('ng build mobile failed');
    }
    if (run('npx', ['cap', 'sync', 'android'], { cwd: mobileDir }).status !== 0) {
      throw new Error('cap sync failed');
    }

    const gradlew = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');
    if (run(gradlew, ['assembleDebug'], { cwd: androidDir }).status !== 0) {
      throw new Error('Gradle build failed');
    }
  } finally {
    // Safe to always restore -- capacitor.config.ts is only read at cap-sync
    // /build time, never by the already-running ng serve mobile.
    writeFileSync(capacitorConfigFile, originalCapacitorConfig);
  }

  console.log('5/6 — Mobile dev server');
  await startMobileDevServer();

  console.log('6/6 — Install & launch');
  const apk = path.join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
  run(adb, ['-s', deviceId, 'install', '-r', apk]);
  run(adb, ['-s', deviceId, 'shell', 'am', 'force-stop', APP_ID]);
  run(adb, [
    '-s',
    deviceId,
    'shell',
    'monkey',
    '-p',
    APP_ID,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  ]);

  console.log(`\n✓ Arena Pulse mobile is running on ${deviceId}.`);
  console.log(
    `  Live-reloading from http://localhost:${MOBILE_PORT} — edit apps/mobile and it reloads.`,
  );
  console.log('  Re-run this script any time; already-running pieces are left alone.');
}

main();
