import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { snapshotSchema, type Snapshot } from '../../shared/domain.ts';
import { accountKey, AppError, BacklogStore, UserBacklogs, type AccountBacklogs } from './store.ts';

const headerSchema = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative(),
  chunks: z.number().int().min(0).max(20), count: z.number().int().min(0).max(1000),
});
const chunkSize = 50;
const empty = (): Snapshot => ({ revision: 0, entries: [] });

// Snapshot chunks keep worst-case metadata safely below Firestore's 1 MiB document limit.
// Every read/write is one transaction, including the root revision and all chunks.
export class FirestoreBacklogStore extends BacklogStore {
  constructor(private db: Firestore, private root: DocumentReference, private importSnapshot?: () => Promise<Snapshot>) {
    super('unused-firestore-store');
  }

  private async current(tx: Transaction): Promise<{ snapshot: Snapshot; chunks: number; exists: boolean }> {
    const root = await tx.get(this.root);
    if (!root.exists) return { snapshot: empty(), chunks: 0, exists: false };
    const header = headerSchema.parse(root.data());
    if (header.chunks !== Math.ceil(header.count / chunkSize)) throw new Error('Invalid backlog chunk count.');
    const docs = header.chunks ? await tx.getAll(...Array.from({ length: header.chunks }, (_, i) => this.root.collection('chunks').doc(String(i)))) : [];
    const entries = docs.flatMap((doc, i) => {
      if (!doc.exists) throw new Error('Missing backlog chunk.');
      const chunk = z.object({ entries: snapshotSchema.shape.entries.max(chunkSize) }).parse(doc.data()).entries;
      if (chunk.length !== Math.min(chunkSize, header.count - i * chunkSize)) throw new Error('Invalid backlog chunk size.');
      return chunk;
    });
    const snapshot = snapshotSchema.parse({ revision: header.revision, entries });
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate stored entry IDs.');
    return { snapshot, chunks: header.chunks, exists: true };
  }

  private write(tx: Transaction, snapshot: Snapshot, previousChunks: number) {
    const chunks = Math.ceil(snapshot.entries.length / chunkSize);
    tx.set(this.root, { schemaVersion: 1, revision: snapshot.revision, chunks, count: snapshot.entries.length });
    for (let i = 0; i < chunks; i++) {
      tx.set(this.root.collection('chunks').doc(String(i)), { entries: snapshot.entries.slice(i * chunkSize, (i + 1) * chunkSize) });
    }
    for (let i = chunks; i < previousChunks; i++) tx.delete(this.root.collection('chunks').doc(String(i)));
  }

  override async read(): Promise<Snapshot> {
    return this.db.runTransaction(async tx => {
      const current = await this.current(tx);
      if (current.exists || !this.importSnapshot) return current.snapshot;
      const imported = snapshotSchema.parse(await this.importSnapshot());
      // A root document is a durable import marker, even after the user empties their list.
      this.write(tx, imported, 0);
      return imported;
    });
  }

  protected override async mutate(change: (current: Snapshot) => Snapshot): Promise<Snapshot> {
    return this.db.runTransaction(async tx => {
      const current = await this.current(tx);
      const before = !current.exists && this.importSnapshot ? snapshotSchema.parse(await this.importSnapshot()) : current.snapshot;
      const next = snapshotSchema.parse(change(before));
      if (!current.exists || next.revision !== before.revision) this.write(tx, next, current.chunks);
      return next;
    });
  }
}

export class FirestoreUserBacklogs implements AccountBacklogs {
  constructor(private db: Firestore, private projectId: string, private local?: UserBacklogs, private importUid?: string) {}

  async forUser(uid: string): Promise<FirestoreBacklogStore> {
    const root = this.db.collection('backlogs').doc(accountKey(this.projectId, uid));
    const importer = uid === this.importUid && this.local ? async () => (await this.local!.forUser(uid)).read() : undefined;
    return new FirestoreBacklogStore(this.db, root, importer);
  }
}

export function createBacklogs(env: Record<string, string | undefined>, legacyFile: string): AccountBacklogs {
  const projectId = env.FIREBASE_PROJECT_ID?.trim() ?? '';
  if (env.FIRESTORE_EMULATOR_HOST && (env.NODE_ENV !== 'test' || !projectId.startsWith('demo-'))) {
    throw new Error('The Firestore emulator is restricted to tests using a demo- Firebase project.');
  }
  const local = new UserBacklogs(legacyFile, projectId, env.LEGACY_BACKLOG_OWNER_UID);
  if (env.BACKLOG_STORAGE === 'file') return local;
  if (env.BACKLOG_STORAGE && env.BACKLOG_STORAGE !== 'firestore') throw new Error('BACKLOG_STORAGE must be firestore or file.');
  // Lazy initialization keeps public health/auth endpoints available during initial setup.
  let stores: FirestoreUserBacklogs | undefined;
  return { async forUser(uid) {
    if (!projectId) throw new AppError(503, 'Firebase project is not configured.');
    if (!stores) {
      const name = `backlog-storage-${projectId}`;
      const app = getApps().find(app => app.name === name) ?? initializeApp({ projectId, credential: applicationDefault() }, name);
      stores = new FirestoreUserBacklogs(getFirestore(app), projectId, local, env.FIRESTORE_IMPORT_UID);
    }
    return stores.forUser(uid);
  } };
}
