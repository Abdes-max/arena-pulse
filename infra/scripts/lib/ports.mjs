import net from 'node:net';
import http from 'node:http';
import { spawnSync } from 'node:child_process';

// Checked on both loopback addresses: dev servers (and the "localhost" a
// browser resolves) can end up on either 127.0.0.1 or ::1 depending on the
// machine's resolver order, so only checking one address can miss a service
// that's actually there.
const LOOPBACK_HOSTS = ['127.0.0.1', '::1'];

function connectOnce(port, host, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (inUse) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

/** Resolves true if something is already listening on the given TCP port, on either loopback address. */
export async function isPortInUse(port, timeoutMs = 500) {
  for (const host of LOOPBACK_HOSTS) {
    if (await connectOnce(port, host, timeoutMs)) return true;
  }
  return false;
}

/** Polls a TCP port until something accepts connections, or gives up after timeoutMs. */
export async function waitForPort(port, timeoutMs = 30_000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function getOnce(port, host, path, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * Dev machines running several projects often share the common ports 3000/4200 —
 * a raw "is the port open" check can't tell *our* dev server from someone else's.
 * This does a GET request (tried on both loopback addresses) and reports whether
 * the body matches what we expect, so `npm run run` can tell "already running"
 * (ours) apart from "port conflict" (something else is squatting the port).
 */
export async function fetchMatches(port, path, expectedSubstring, timeoutMs = 1500) {
  for (const host of LOOPBACK_HOSTS) {
    const body = await getOnce(port, host, path, timeoutMs);
    if (body?.includes(expectedSubstring)) return true;
  }
  return false;
}

/**
 * Force-kills whatever is listening on `port`, by PID, regardless of who
 * started it or whether it's tracked in .run/pids.json -- a process started
 * outside `npm run run` (e.g. a one-off `ng serve` re-run by hand) is
 * invisible to the pid-file-based stop in stop.mjs, and would otherwise be
 * left running forever, silently serving stale code on a subsequent restart.
 * Best-effort: never throws, a port with nothing on it is a silent no-op.
 */
export function killProcessOnPort(port) {
  const pids = findPidsOnPort(port);
  for (const pid of pids) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      spawnSync('kill', ['-9', String(pid)], { stdio: 'ignore' });
    }
  }
  return pids;
}

function findPidsOnPort(port) {
  if (process.platform === 'win32') {
    // "netstat -ano" output columns: Proto Local Foreign State PID -- match
    // lines for this exact local port in LISTENING state, PID is the last
    // whitespace-separated field.
    const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    const lines = (result.stdout ?? '').split('\n');
    const pids = new Set();
    for (const line of lines) {
      if (!line.includes('LISTENING')) continue;
      const columns = line.trim().split(/\s+/);
      const localAddress = columns[1] ?? '';
      const portSuffix = `:${port}`;
      if (!localAddress.endsWith(portSuffix)) continue;
      const pid = Number(columns[columns.length - 1]);
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  }
  // macOS/Linux: lsof lists one PID per line for everything holding the port open.
  const result = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' });
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}
