import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { identity, snapshotSchema, type Media, type Snapshot } from '../../shared/domain.ts';

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// One writer process; serialized, atomic mutations with optimistic concurrency.
export class BacklogStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  async read(): Promise<Snapshot> {
    try { return snapshotSchema.parse(JSON.parse(await readFile(this.file, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { revision: 0, entries: [] };
      throw error; // Never silently replace corrupt or unreadable user data.
    }
  }

  private mutate(change: (current: Snapshot) => Snapshot): Promise<Snapshot> {
    const operation = this.queue.then(async () => {
      const current = await this.read();
      const next = snapshotSchema.parse(change(current));
      await mkdir(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      await writeFile(temp, JSON.stringify(next, null, 2), 'utf8');
      await rename(temp, this.file);
      return next;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  add(media: Media): Promise<Snapshot> {
    return this.mutate(current => {
      if (current.entries.some(entry => identity(entry) === identity(media))) return current;
      if (current.entries.length >= 1000) throw new AppError(400, 'This backlog has reached its 1,000 item limit.');
      return {
        revision: current.revision + 1,
        entries: [...current.entries, { ...media, id: randomUUID(), addedAt: new Date().toISOString() }],
      };
    });
  }

  reorder(ids: string[], revision: number): Promise<Snapshot> {
    return this.mutate(current => {
      if (revision !== current.revision) throw new AppError(409, 'The list changed in another tab. Reload the list and try again.');
      const lookup = new Map(current.entries.map(entry => [entry.id, entry]));
      if (ids.length !== lookup.size || new Set(ids).size !== ids.length || ids.some(id => !lookup.has(id))) {
        throw new AppError(400, 'The order must contain every item exactly once.');
      }
      return { revision: current.revision + 1, entries: ids.map(id => lookup.get(id)!) };
    });
  }

  remove(id: string, revision: number): Promise<Snapshot> {
    return this.mutate(current => {
      if (current.revision !== revision) throw new AppError(409, 'The list changed in another tab. Reload the list and try again.');
      if (!current.entries.some(entry => entry.id === id)) throw new AppError(404, 'Item not found.');
      return { revision: current.revision + 1, entries: current.entries.filter(entry => entry.id !== id) };
    });
  }
}
