import net from 'node:net';
import http from 'node:http';

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
