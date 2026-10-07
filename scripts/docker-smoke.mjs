import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Every test owns a uniquely named disposable container and volume.
// It never mounts the user's local data or Compose volume.
const image = process.argv[2] ?? 'backlog-backlog:latest';
const name = `backlog-smoke-${randomUUID()}`;
const volume = `${name}-data`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let containerCreated = false;
let volumeCreated = false;

async function start() {
  docker('run', '-d', '--name', name, '--read-only', '--tmpfs', '/tmp',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    '--mount', `type=volume,source=${volume},target=/app/data`,
    '--publish', '127.0.0.1::3001', image);
  containerCreated = true;
  const address = docker('port', name, '3001/tcp');
  const base = `http://${address}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${base}/api/backlog`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return base;
    } catch { /* Wait for the container to bind its port. */ }
    await delay(500);
  }
  throw new Error('Container did not become ready within 30 seconds.');
}

async function request(base, path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.ok, true, `HTTP ${response.status}: ${await response.clone().text()}`);
  return response.json();
}

try {
  docker('volume', 'create', volume);
  volumeCreated = true;
  let base = await start();
  const html = await (await fetch(base)).text();
  assert.match(html, /<div id="root">/);
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert.ok(asset, 'Compiled React entry point is present');
  assert.equal((await fetch(`${base}${asset}`)).status, 200);
  assert.equal(docker('exec', name, 'id', '-u'), '1000');
  assert.equal(docker('exec', name, 'node', '-e', "console.log(require('node:fs').existsSync('/app/.env'))"), 'false');
  assert.equal(docker('exec', name, 'node', '-e', "console.log(require('node:fs').existsSync('/app/node_modules/typescript'))"), 'false');
  assert.equal((await fetch(`${base}/api/backlog`, { headers: { Origin: 'https://example.com' } })).status, 403);
  for (const title of ['Docker first', 'Docker second']) {
    await request(base, '/api/backlog', 'POST', { type: 'game', title, source: 'manual', sourceId: randomUUID() });
  }
  const original = await request(base, '/api/backlog');
  const reordered = await request(base, '/api/backlog/order', 'PUT', {
    revision: original.revision, ids: original.entries.map(entry => entry.id).reverse(),
  });
  assert.deepEqual(reordered.entries.map(entry => entry.title), ['Docker second', 'Docker first']);
  docker('stop', '--time', '15', name);
  assert.equal(docker('inspect', '--format', '{{.State.ExitCode}}', name), '0');
  docker('rm', name);
  containerCreated = false;
  base = await start();
  assert.deepEqual(await request(base, '/api/backlog'), reordered);
  console.log('Docker checks passed: static assets, non-root runtime, excluded secrets/dev tools, origin checks, add/reorder, clean shutdown, and persistence across container replacement.');
} finally {
  if (containerCreated) {
    docker('stop', '--time', '15', name);
    docker('rm', name);
  }
  if (volumeCreated) docker('volume', 'rm', volume);
  console.log('Removed only the disposable smoke-test container and volume.');
}
