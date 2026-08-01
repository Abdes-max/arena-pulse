import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const isWin = process.platform === 'win32';

/** Resolves adb/emulator binary paths from ANDROID_HOME/ANDROID_SDK_ROOT, or null if unset. */
export function resolveAndroidSdk() {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdkRoot) return null;
  return {
    adb: path.join(sdkRoot, 'platform-tools', isWin ? 'adb.exe' : 'adb'),
    emulatorBin: path.join(sdkRoot, 'emulator', isWin ? 'emulator.exe' : 'emulator'),
  };
}

export function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, ...options });
}

export function runCapture(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: isWin, ...options });
}

/** Returns the connected emulator's adb device id (e.g. "emulator-5554"), or undefined if none. */
export function connectedEmulatorId(adb) {
  const devices = runCapture(adb, ['devices']).stdout ?? '';
  return devices
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t')[0]?.trim())
    .find((id) => id?.startsWith('emulator-'));
}

/** Kills whatever is listening on `port` on this machine. Returns true if anything was killed. */
export function killPort(port) {
  if (isWin) {
    const netstat = runCapture('netstat', ['-ano']).stdout ?? '';
    const pids = new Set(
      netstat
        .split('\n')
        .filter((line) => line.includes(`:${port} `) && line.includes('LISTENING'))
        .map((line) => line.trim().split(/\s+/).pop())
        .filter(Boolean),
    );
    for (const pid of pids) {
      spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
    }
    return pids.size > 0;
  }
  const pids = (runCapture('lsof', ['-ti', `tcp:${port}`]).stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const pid of pids) {
    spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
  }
  return pids.length > 0;
}
