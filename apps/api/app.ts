import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { mediaSchema, mediaTypeSchema, reorderSchema } from '../../shared/domain.ts';
import { AppError, type AccountBacklogs, type BacklogRepository } from './store.ts';
import { createCatalog, providerStatus } from './providers.ts';
import { authConfig, createTokenVerifier, type TokenVerifier } from './auth.ts';

export function createApp(stores: AccountBacklogs, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch, verifyToken: TokenVerifier | undefined = createTokenVerifier(env)) {
  const app = express();
  const catalog = createCatalog(env, fetcher);
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Local-only application: reject cross-site requests and DNS rebinding hosts.
    const hostname = req.hostname;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return res.status(403).json({ error: 'Local access only.' });
    const origin = req.get('origin');
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (!['http:', 'https:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error();
      } catch { return res.status(403).json({ error: 'Cross-site requests are not allowed.' }); }
    }
    if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/auth/config', (_req, res) => res.json(authConfig(env)));
  app.use('/api', async (req, res, next) => {
    if (!verifyToken) throw new AppError(503, 'Firebase Authentication is not configured yet.');
    const match = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '');
    if (!match) throw new AppError(401, 'Please sign in to access your backlog.');
    let uid: string;
    try { ({ uid } = await verifyToken(match[1])); }
    catch { throw new AppError(401, 'Your session could not be verified. Please sign in again.'); }
    res.locals.store = await stores.forUser(uid);
    next();
  });
  app.get('/api/providers', (_req, res) => res.json(providerStatus(env)));
  app.get('/api/backlog', async (_req, res) => res.json(await (res.locals.store as BacklogRepository).read()));
  app.post('/api/backlog', async (req, res) => res.status(201).json(await (res.locals.store as BacklogRepository).add(mediaSchema.parse(req.body))));
  app.put('/api/backlog/order', async (req, res) => {
    const { ids, revision } = reorderSchema.parse(req.body);
    res.json(await (res.locals.store as BacklogRepository).reorder(ids, revision));
  });
  app.delete('/api/backlog/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { revision } = z.object({ revision: z.number().int().nonnegative() }).parse(req.body);
    res.json(await (res.locals.store as BacklogRepository).remove(id, revision));
  });
  // Bound catalog usage without introducing a distributed rate-limit dependency.
  let searches: number[] = [];
  app.get('/api/search', async (req, res) => {
    const type = mediaTypeSchema.parse(req.query.type);
    const query = z.string().trim().min(2).max(100).parse(req.query.q);
    searches = searches.filter(time => Date.now() - time < 60000);
    if (searches.length >= 30) throw new AppError(429, 'Please wait a minute before searching again.');
    searches.push(Date.now());
    try { res.json({ results: await catalog(type, query) }); }
    catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, 'The catalog did not respond. Try again or add the item manually.');
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Please check the submitted fields.' }); return; }
    if (error instanceof AppError) { res.status(error.status).json({ error: error.message }); return; }
    if (error.status === 400 || error.status === 413) { res.status(error.status).json({ error: 'Invalid or oversized request.' }); return; }
    console.error('Backlog operation failed:', error.code ?? error.name ?? 'UnknownError');
    res.status(500).json({ error: 'Could not read or save your backlog. Your saved data has not been reset. Check the server database configuration and try again.' });
  };
  app.use(errorHandler);
  return app;
}
