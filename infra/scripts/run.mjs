#!/usr/bin/env node
// Starts local infrastructure (Docker Compose: PostgreSQL, MinIO, Mailhog) and
// the 3 native apps (api, public-web, admin-web). Safe to re-run: any Arena
// Pulse service already running is left alone instead of started twice. On a
// machine running several projects, a plain "is the port open" check can't
// tell our dev server apart from someone else's — so each app is verified by
// its actual response, not just whether the port answers.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isPortInUse, waitForPort, fetchMatches } from './lib/ports.mjs';

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');
const runDir = path.join(rootDir, '.run');
const logsDir = path.join(runDir, 'logs');
const pidsFile = path.join(runDir, 'pids.json');
const composeFile = path.join(rootDir, 'infra/compose/docker-compose.yml');

mkdirSync(logsDir, { recursive: true });

const pids = existsSync(pidsFile) ? JSON.parse(readFileSync(pidsFile, 'utf8')) : {};
let hadConflict = false;

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
}

function startBackground(name, cmd, args, port) {
  const outFd = openSync(path.join(logsDir, `${name}.log`), 'a');
  const child = spawn(cmd, args, {
    cwd: rootDir,
    shell: process.platform === 'win32',
    detached: true,
    stdio: ['ignore', outFd, outFd],
  });
  child.unref();
  pids[name] = { pid: child.pid, port };
  console.log(`  → ${name} starting (pid ${child.pid}), logs: .run/logs/${name}.log`);
}

/** Starts `name` unless it (or something else) already answers on `port`. */
async function ensureNativeService(name, cmd, args, port, signaturePath, signatureSubstring) {
  if (!(await isPortInUse(port))) {
    startBackground(name, cmd, args, port);
    return;
  }
  // Something is listening — give it a moment in case it just started, then
  // check whether it's actually our app before deciding what that means.
  const isOurs = await fetchMatches(port, signaturePath, signatureSubstring);
  if (isOurs) {
    console.log(`✓ ${name} already running on port ${port} — leaving it alone.`);
  } else {
    hadConflict = true;
    console.error(
      `✗ ${name}: port ${port} is in use by something else (not Arena Pulse's ${name}). ` +
        `Stop whatever else is using port ${port}, or change its port, then re-run "npm run run".`,
    );
  }
}

async function main() {
  console.log('1/4 — Docker infrastructure (postgres, minio, mailhog)');
  const compose = run('docker', ['compose', '-f', composeFile, 'up', '-d']);
  if (compose.status !== 0) {
    console.error(
      'Docker Compose failed to start (see above). Common causes: Docker Desktop is not ' +
        'running, or another project already occupies one of ports 5433/9000/9001/8025/1025.',
    );
    process.exit(1);
  }

  console.log('    waiting for PostgreSQL to accept connections...');
  const pgReady = await waitForPort(Number(process.env.POSTGRES_HOST_PORT) || 5433);
  console.log(pgReady ? '✓ PostgreSQL ready.' : '⚠ PostgreSQL did not become ready in time — continuing anyway.');

  console.log('2/4 — Building design-tokens / design-system libraries');
  const libs = run('npm', ['run', 'build:libs']);
  if (libs.status !== 0) {
    console.error('Building libs failed — aborting before starting apps.');
    process.exit(1);
  }

  console.log('3/4 — API (NestJS)');
  await ensureNativeService('api', 'npm', ['--prefix', 'apps/api', 'run', 'start:dev'], 3000, '/api/v1', 'Hello World');

  console.log('4/4 — Web apps (Angular)');
  await ensureNativeService('web', 'npx', ['ng', 'serve', 'web'], 4200, '/', 'PublicWeb');
  await ensureNativeService(
    'admin-web',
    'npx',
    ['ng', 'serve', 'admin-web', '--port', '4300'],
    4300,
    '/',
    'AdminWeb',
  );

  writeFileSync(pidsFile, JSON.stringify(pids, null, 2));

  console.log('\nArena Pulse:');
  console.log('  web         http://localhost:4200');
  console.log('  admin-web   http://localhost:4300');
  console.log('  api         http://localhost:3000/api/docs');
  console.log('  minio       http://localhost:9001 (console)');
  console.log('  mailhog     http://localhost:8025');
  console.log('\nRun "npm run stop" to stop everything.');

  if (hadConflict) {
    process.exit(1);
  }
}

main();
