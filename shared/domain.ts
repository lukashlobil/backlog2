import { z } from 'zod';

export const mediaTypeSchema = z.enum(['game', 'book', 'movie']);
export type MediaType = z.infer<typeof mediaTypeSchema>;
export const mediaSchema = z.object({
  type: mediaTypeSchema,
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(200).default(''),
  year: z.string().regex(/^\d{4}$/).or(z.literal('')).default(''),
  coverUrl: z.string().url().max(2000).refine(value => value.startsWith('https://'), 'Cover must use HTTPS').or(z.literal('')).default(''),
  source: z.enum(['manual', 'openlibrary', 'igdb', 'tmdb']),
  sourceId: z.string().min(1).max(200),
});
export type Media = z.infer<typeof mediaSchema>;
export const entrySchema = mediaSchema.extend({ id: z.string().uuid(), addedAt: z.string().datetime() });
export type Entry = z.infer<typeof entrySchema>;
export const snapshotSchema = z.object({ revision: z.number().int().nonnegative(), entries: z.array(entrySchema).max(1000) });
export type Snapshot = z.infer<typeof snapshotSchema>;
export const reorderSchema = z.object({ revision: z.number().int().nonnegative(), ids: z.array(z.string().uuid()).max(1000) });

export function identity(media: Media): string {
  return media.source === 'manual'
    ? `${media.type}:manual:${media.title.trim().toLocaleLowerCase()}:${media.year}`
    : `${media.type}:${media.source}:${media.sourceId}`;
}

// Reorder only the visible slots, leaving other media types in place.
export function moveVisible(entries: Entry[], visibleIds: string[], activeId: string, overId: string): Entry[] {
  const from = visibleIds.indexOf(activeId);
  const to = visibleIds.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return entries;
  const reordered = [...visibleIds];
  reordered.splice(to, 0, reordered.splice(from, 1)[0]);
  const lookup = new Map(entries.map(entry => [entry.id, entry]));
  const visible = new Set(visibleIds);
  let next = 0;
  return entries.map(entry => visible.has(entry.id) ? lookup.get(reordered[next++])! : entry);
}
