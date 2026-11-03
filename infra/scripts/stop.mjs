#!/usr/bin/env node
// Stops whatever `npm run run` started: the native api/web processes it
// tracked, plus the Docker Compose infrastructure. Safe to re-run: processes
// that are already gone are skipped rather than erroring.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isPortInUse, killProcessOnPort } from './lib/ports.mjs';

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');
const pidsFile = path.join(rootDir, '.run/pids.json');
const composeFile = path.join(rootDir, 'infra/compose/docker-compose.yml');

// Every port `npm run run` prints in its final "Arena Pulse:" summary, native
// and Docker-backed alike. Kept in sync by hand with run.mjs's own log lines.
const ALL_PORTS = { web: 4200, api: 3000, minio: 9001, mailhog: 8025 };

function killTree(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGTERM'); // negative pid = whole process group (detached: true)
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }
}

async function main() {
  console.log('1/3 — Stopping native processes (api, web)');
  if (existsSync(pidsFile)) {
    const pids = JSON.parse(readFileSync(pidsFile, 'utf8'));
    for (const [name, info] of Object.entries(pids)) {
      const stillUp = await isPortInUse(info.port);
      if (!stillUp) {
        console.log(`  → ${name} was not running — nothing to do.`);
        continue;
      }
      console.log(`  → stopping ${name} (pid ${info.pid})`);
      killTree(info.pid);
    }
    rmSync(pidsFile, { force: true });
  } else {
    console.log('  → no tracked processes (.run/pids.json not found) — nothing to do.');
  }

  console.log('2/3 — Stopping Docker infrastructure (postgres, minio, mailhog)');
  spawnSync('docker', ['compose', '-f', composeFile, 'stop'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  // Belt-and-suspenders final sweep, on every port `npm run run` prints as
  // "Arena Pulse:" (native and Docker-backed alike). Step 1 only knows about
  // processes it itself started via `npm run run` (tracked in
  // .run/pids.json) -- anything else holding one of these ports (a one-off
  // `ng serve`/`nest start` re-run by hand, a process from a previous
  // session that outlived its terminal, or a Docker container that failed
  // to release its port on `stop`) is invisible to the steps above and
  // would otherwise keep serving stale code/data indefinitely.
  console.log(`3/3 — Force-stopping anything still on ${Object.values(ALL_PORTS).join('/')}`);
  for (const [name, port] of Object.entries(ALL_PORTS)) {
    const killedPids = killProcessOnPort(port);
    console.log(
      killedPids.length > 0
        ? `  → ${name} (port ${port}): stopped pid(s) ${killedPids.join(', ')}`
        : `  → ${name} (port ${port}): nothing was listening.`,
    );
  }

  console.log('\nArena Pulse stopped. Data (Postgres/MinIO volumes) is preserved.');
  console.log('Use "docker compose -f infra/compose/docker-compose.yml down -v" to wipe it.');
}

main();
