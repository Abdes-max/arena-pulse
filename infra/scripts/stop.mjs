#!/usr/bin/env node
// Stops whatever `npm run run` started: the native api/public-web/admin-web
// processes it tracked, plus the Docker Compose infrastructure. Safe to
// re-run: processes that are already gone are skipped rather than erroring.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isPortInUse } from './lib/ports.mjs';

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');
const pidsFile = path.join(rootDir, '.run/pids.json');
const composeFile = path.join(rootDir, 'infra/compose/docker-compose.yml');

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
  console.log('1/2 — Stopping native processes (api, public-web, admin-web)');
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

  console.log('2/2 — Stopping Docker infrastructure (postgres, minio, mailhog)');
  spawnSync('docker', ['compose', '-f', composeFile, 'stop'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  console.log('\nArena Pulse stopped. Data (Postgres/MinIO volumes) is preserved.');
  console.log('Use "docker compose -f infra/compose/docker-compose.yml down -v" to wipe it.');
}

main();
