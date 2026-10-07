import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBacklogs } from '../apps/api/firestore.ts';
import { UserBacklogs, accountKey } from '../apps/api/store.ts';

test('Firestore is the default; file mode must be explicit and invalid configuration fails closed', async () => {
  assert.ok(createBacklogs({ BACKLOG_STORAGE: 'file' }, 'unused.json') instanceof UserBacklogs);
  await assert.rejects(createBacklogs({}, 'unused.json').forUser('owner'), /not configured/);
  assert.throws(() => createBacklogs({ BACKLOG_STORAGE: 'typo' }, 'unused.json'), /must be/);
  for (const env of [
    { NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'demo-backlog' },
    { NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'real-project' },
  ]) assert.throws(() => createBacklogs({ ...env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085' }, 'unused.json'), /restricted to tests/);
  assert.throws(() => accountKey('project', ''), /Invalid account/);
  assert.throws(() => accountKey('project', 'x'.repeat(129)), /Invalid account/);
  assert.notEqual(accountKey('project-a', 'owner'), accountKey('project-b', 'owner'));
  assert.match(accountKey('project', 'uid/with/path'), /^[a-f0-9]{64}$/);
});
