import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { BacklogStore } from './store.ts';

const app = createApp(new BacklogStore(resolve(process.env.BACKLOG_DATA_FILE ?? 'data/backlog.json')));
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}
const port = Number(process.env.PORT ?? 3001);
app.listen(port, '127.0.0.1', () => console.log(`Backlog API: http://127.0.0.1:${port}`));
