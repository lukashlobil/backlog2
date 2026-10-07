import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { BacklogStore, UserBacklogs } from '../apps/api/store.ts';
import { authConfig, createTokenVerifier } from '../apps/api/auth.ts';
import { createApp } from '../apps/api/app.ts';
import { createCatalog } from '../apps/api/providers.ts';
import { moveVisible, type Media } from '../shared/domain.ts';

const media = (title: string, type: Media['type'] = 'game'): Media => ({ title, type, subtitle: '', year: '', coverUrl: '', source: 'manual', sourceId: title });
async function store() { return new BacklogStore(join(await mkdtemp(join(tmpdir(), 'backlog-test-')), 'backlog.json')); }

test('add is persistent and idempotent, including concurrent duplicate requests', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'backlog-test-')), 'backlog.json');
  const db = new BacklogStore(file);
  await Promise.all([db.add(media('Hades')), db.add(media('Hades')), db.add(media('Dune', 'book'))]);
  const persisted = await new BacklogStore(file).read();
  assert.deepEqual(persisted.entries.map(entry => entry.title), ['Hades', 'Dune']);
  assert.equal(persisted.revision, 2);
});

test('reordering persists and stale, missing, and duplicate IDs cannot overwrite the list', async () => {
  const db = await store();
  await db.add(media('Hades'));
  const before = await db.add(media('Dune', 'book'));
  const ids = before.entries.map(entry => entry.id);
  const after = await db.reorder([...ids].reverse(), before.revision);
  assert.equal((await db.read()).entries[0].title, 'Dune');
  await assert.rejects(db.reorder(ids, before.revision), /another tab/);
  await assert.rejects(db.reorder([ids[0], ids[0]], after.revision), /exactly once/);
  await assert.rejects(db.reorder([ids[0]], after.revision), /exactly once/);
  assert.deepEqual(await db.read(), after);
});

test('filtered reordering leaves other media in their original slots', async () => {
  const db = await store();
  await db.add(media('Hades')); await db.add(media('Dune', 'book'));
  const { entries } = await db.add(media('Celeste'));
  const games = [entries[0].id, entries[2].id];
  assert.deepEqual(moveVisible(entries, games, games[1], games[0]).map(entry => entry.title), ['Celeste', 'Dune', 'Hades']);
});

test('corrupt data is reported and never replaced by a mutation', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'backlog-test-')), 'backlog.json');
  await writeFile(file, '{broken');
  await assert.rejects(new BacklogStore(file).add(media('Hades')));
  assert.equal(await readFile(file, 'utf8'), '{broken');
});

test('API validates requests, persists changes, and rejects cross-site access', async t => {
  const db = new UserBacklogs(join(await mkdtemp(join(tmpdir(), 'backlog-api-')), 'backlog.json'), 'test-project');
  const app = createApp(db, {}, async () => new Response(JSON.stringify({ docs: [{ key: '/works/OL1W', title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965, cover_i: 123 }] })), async token => ({ uid: token }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api`;
  const headers = { Authorization: 'Bearer test-user' };
  const post = (body: unknown, origin?: string) => fetch(`${url}/backlog`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post({ title: '' })).status, 400);
  assert.equal((await post(media('Hades'), 'https://evil.example')).status, 403);
  assert.equal((await post(media('Hades'))).status, 201);
  assert.equal((await (await fetch(`${url}/backlog`, { headers })).json()).entries.length, 1);
  const found = await (await fetch(`${url}/search?type=book&q=dune`, { headers })).json();
  assert.equal(found.results[0].subtitle, 'Frank Herbert');
  assert.equal((await fetch(`${url}/search?type=game&q=hades`, { headers })).status, 503);
  assert.equal((await fetch(`${url}/search?type=book&q=x`, { headers })).status, 400);
});

test('protected API rejects missing/invalid tokens and isolates users for reads, writes, reorder, and deletion', async t => {
  const stores = new UserBacklogs(join(await mkdtemp(join(tmpdir(), 'backlog-auth-')), 'backlog.json'), 'project');
  const app = createApp(stores, {}, fetch, async token => {
    if (!['alice', 'bob'].includes(token)) throw new Error('Invalid or expired token');
    return { uid: token };
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const call = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  for (const path of ['/backlog', '/providers', '/search?type=book&q=dune']) {
    assert.equal((await call(path)).status, 401);
    assert.equal((await call(path, 'expired')).status, 401);
  }
  const saved = await (await call('/backlog', 'alice', 'POST', { ...media('Private game'), ownerId: 'bob' })).json();
  assert.equal(saved.entries.length, 1);
  assert.equal((await (await call('/backlog?uid=alice', 'bob')).json()).entries.length, 0);
  assert.equal((await call(`/backlog/${saved.entries[0].id}`, 'bob', 'DELETE', { revision: 0 })).status, 404);
  assert.equal((await call('/backlog/order', 'bob', 'PUT', { revision: 0, ids: [saved.entries[0].id] })).status, 400);
  assert.deepEqual(await (await call('/backlog', 'alice')).json(), saved);
  assert.equal((await call('/health')).status, 200);
});

test('unconfigured auth fails closed and exposes no catalog credentials', async t => {
  const env = { IGDB_CLIENT_SECRET: 'secret-must-not-leak' };
  assert.deepEqual(authConfig(env), { configured: false, firebase: null });
  const app = createApp(new UserBacklogs('unused.json', 'unconfigured'), env);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  assert.equal((await fetch(`${base}/api/backlog`)).status, 503);
  assert.doesNotMatch(await (await fetch(`${base}/api/auth/config`)).text(), /secret-must-not-leak/);
});

test('legacy data is copied only for an explicit owner without overwriting or sharing it', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'backlog-migrate-')), 'backlog.json');
  const legacy = await new BacklogStore(file).add(media('Old favorite'));
  const stores = new UserBacklogs(file, 'project', 'owner');
  assert.equal((await (await stores.forUser('someone-else')).read()).entries.length, 0);
  const owner = await stores.forUser('owner');
  assert.deepEqual(await owner.read(), legacy);
  await owner.remove(legacy.entries[0].id, legacy.revision);
  assert.equal((await (await new UserBacklogs(file, 'project', 'owner').forUser('owner')).read()).entries.length, 0);
  assert.deepEqual(await new BacklogStore(file).read(), legacy);
  assert.equal((await (await new UserBacklogs(file, 'different-project').forUser('owner')).read()).entries.length, 0);
});

test('production forbids emulator configuration and real Admin verification rejects unsigned tokens', async () => {
  const env = { FIREBASE_PROJECT_ID: 'test-backlog', FIREBASE_API_KEY: 'public-api-key', FIREBASE_AUTH_DOMAIN: 'test-backlog.firebaseapp.com', FIREBASE_APP_ID: 'test-app' };
  assert.throws(() => authConfig({ ...env, NODE_ENV: 'production', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }), /restricted to tests/);
  const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'victim', aud: 'test-backlog', iss: 'https://securetoken.google.com/test-backlog', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })).toString('base64url')}.`;
  await assert.rejects(createTokenVerifier(env)!(unsigned));
});

test('provider failures are surfaced and book metadata is normalized', async () => {
  const failing = createCatalog({}, async () => new Response('', { status: 429 }));
  await assert.rejects(failing('book', 'dune'), /unavailable/);
  let requests = 0;
  const catalog = createCatalog({}, async () => {
    requests++;
    return new Response(JSON.stringify({ docs: [{ title: 'Dune', key: '/works/OL1W', cover_i: 123, first_publish_year: 1965 }, { title: '', key: 'invalid' }] }));
  });
  const results = await catalog('book', 'dune');
  assert.equal(results.length, 1);
  assert.equal(results[0].coverUrl, 'https://covers.openlibrary.org/b/id/123-M.jpg');
  await catalog('book', 'dune');
  assert.equal(requests, 1);
});
