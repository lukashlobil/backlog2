import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const api = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--env-file-if-exists=.env', 'apps/api/index.ts'], { stdio: 'inherit' });
let web;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill();
  await web?.close();
  process.exit(code);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
api.on('exit', code => { if (!stopping) void stop(code ?? 1); });
api.on('error', error => { console.error(error.message); void stop(1); });
try {
  web = await createServer();
  await web.listen();
  web.printUrls();
} catch (error) {
  console.error(error);
  await stop(1);
}
