import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { BacklogStore } from '../apps/api/store.ts';
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
  const db = await store();
  const app = createApp(db, {}, async () => new Response(JSON.stringify({ docs: [{ key: '/works/OL1W', title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965, cover_i: 123 }] })));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api`;
  const post = (body: unknown, origin?: string) => fetch(`${url}/backlog`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post({ title: '' })).status, 400);
  assert.equal((await post(media('Hades'), 'https://evil.example')).status, 403);
  assert.equal((await post(media('Hades'))).status, 201);
  assert.equal((await (await fetch(`${url}/backlog`)).json()).entries.length, 1);
  const found = await (await fetch(`${url}/search?type=book&q=dune`)).json();
  assert.equal(found.results[0].subtitle, 'Frank Herbert');
  assert.equal((await fetch(`${url}/search?type=game&q=hades`)).status, 503);
  assert.equal((await fetch(`${url}/search?type=book&q=x`)).status, 400);
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
