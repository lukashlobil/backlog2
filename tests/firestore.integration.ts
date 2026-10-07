import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreUserBacklogs, createBacklogs } from '../apps/api/firestore.ts';
import { BacklogStore, UserBacklogs, accountKey } from '../apps/api/store.ts';
import { createApp } from '../apps/api/app.ts';
import type { Media, Snapshot } from '../shared/domain.ts';

const projectId = 'demo-backlog-storage';
if (!/^127\.0\.0\.1:8085$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) throw new Error('Run only through npm run test:firestore; never use a live project.');
const app = initializeApp({ projectId }, `test-${randomUUID()}`);
const db = getFirestore(app);
after(async () => { await db.terminate(); await deleteApp(app); });
const stores = () => new FirestoreUserBacklogs(db, projectId);
const media = (title: string): Media => ({ title, type: 'game', subtitle: '', year: '', coverUrl: '', source: 'manual', sourceId: title });

test('Firestore persists across repository instances; concurrent additions merge and duplicates stay idempotent', async () => {
  const uid = randomUUID();
  const first = await stores().forUser(uid);
  const second = await stores().forUser(uid);
  await Promise.all([first.add(media('Hades')), second.add(media('Hades'))]);
  await Promise.all([first.add(media('Dune')), second.add(media('Celeste'))]);
  const saved = await (await stores().forUser(uid)).read();
  assert.equal(saved.revision, 3);
  assert.deepEqual(saved.entries.map(e => e.title).sort(), ['Celeste', 'Dune', 'Hades']);
  assert.equal((await (await stores().forUser(randomUUID())).read()).entries.length, 0);
});

test('Firestore reorder/removal validate IDs and revisions; simultaneous reorder has only one winner', async () => {
  const uid = randomUUID();
  const first = await stores().forUser(uid);
  const second = await stores().forUser(uid);
  await first.add(media('A'));
  const before = await first.add(media('B'));
  const ids = before.entries.map(e => e.id);
  const results = await Promise.allSettled([first.reorder(ids, before.revision), second.reorder([...ids].reverse(), before.revision)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const saved = await first.read();
  await assert.rejects(first.reorder([ids[0], ids[0]], saved.revision), /exactly once/);
  await assert.rejects(first.reorder([ids[0]], saved.revision), /exactly once/);
  await assert.rejects(first.remove(ids[0], before.revision), /another tab/);
  await assert.rejects(first.remove(randomUUID(), saved.revision), /not found/);
  assert.deepEqual(await first.read(), saved);
  const removed = await first.remove(ids[0], saved.revision);
  assert.equal(removed.entries.length, 1);
  assert.deepEqual(await second.read(), removed);
});

test('Firestore import is explicit, preserves local data and never overwrites an existing cloud list', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'backlog-firestore-')), 'backlog.json');
  const uid = randomUUID();
  const snapshot = await new BacklogStore(file).add(media('Legacy'));
  const original = await readFile(file, 'utf8');
  const local = new UserBacklogs(file, projectId, uid);
  assert.equal((await (await stores().forUser(uid)).read()).entries.length, 0);
  const importedStores = new FirestoreUserBacklogs(db, projectId, local, uid);
  assert.equal((await (await importedStores.forUser(randomUUID())).read()).entries.length, 0);
  const owner = await importedStores.forUser(uid);
  assert.deepEqual(await owner.read(), snapshot);
  await owner.remove(snapshot.entries[0].id, snapshot.revision);
  assert.equal((await (await new FirestoreUserBacklogs(db, projectId, local, uid).forUser(uid)).read()).entries.length, 0);
  assert.equal(await readFile(file, 'utf8'), original);
});

test('large 1,000-entry snapshot imports atomically in bounded chunks; corrupt/missing chunks never reset data', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'backlog-firestore-large-')), 'backlog.json');
  const uid = randomUUID();
  const snapshot: Snapshot = { revision: 12, entries: Array.from({ length: 1000 }, (_, i) => ({
    ...media(`Game ${i}`), coverUrl: `https://example.com/${'x'.repeat(1950)}`, id: randomUUID(), addedAt: new Date().toISOString(),
  })) };
  await writeFile(file, JSON.stringify(snapshot));
  const local = new UserBacklogs(file, projectId, uid);
  const owner = await new FirestoreUserBacklogs(db, projectId, local, uid).forUser(uid);
  assert.deepEqual(await owner.read(), snapshot);
  await assert.rejects(owner.add(media('Too many')), /1,000 item limit/);
  const reversed = await owner.reorder(snapshot.entries.map(e => e.id).reverse(), snapshot.revision);
  assert.deepEqual(await (await stores().forUser(uid)).read(), reversed);
  const root = db.collection('backlogs').doc(accountKey(projectId, uid));
  await root.collection('chunks').doc('0').delete();
  await assert.rejects(owner.add(media('Do not reset')), /Missing backlog chunk/);
  assert.equal((await root.get()).data()!.revision, reversed.revision);
});

test('authenticated API isolates Firestore accounts and direct client access is denied by rules', async t => {
  const api = createApp(stores(), {}, fetch, async token => {
    if (!['alice', 'bob'].includes(token)) throw new Error('invalid');
    return { uid: `${t.name}-${token}` };
  });
  const server = api.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/backlog`;
  const call = (token: string, path = '', method = 'GET', body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await call('invalid')).status, 401);
  const saved = await (await call('alice', '', 'POST', { ...media('Private'), uid: 'bob' })).json();
  assert.equal((await (await call('bob', '?uid=alice')).json()).entries.length, 0);
  assert.equal((await call('bob', `/${saved.entries[0].id}`, 'DELETE', { revision: 0 })).status, 404);
  assert.equal((await call('bob', '/order', 'PUT', { revision: 0, ids: [saved.entries[0].id] })).status, 400);
  assert.deepEqual(await (await call('alice')).json(), saved);
  const path = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/backlogs/${accountKey(projectId, `${t.name}-alice`)}`;
  assert.equal((await fetch(path)).status, 403);
  assert.equal((await fetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) })).status, 403);
});

test('runtime factory uses the emulator without private credentials', async () => {
  const accounts = createBacklogs({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId, FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST }, 'unused.json');
  const owner = await accounts.forUser(randomUUID());
  const saved = await owner.add(media('Factory'));
  assert.deepEqual(await owner.read(), saved);
});
