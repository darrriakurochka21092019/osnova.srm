import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../apps/api/src/app';
const dir = await mkdtemp(path.join(tmpdir(), 'osnova-e2e-'));
const { app } = await createApp({
  dataDir: dir,
  origin: 'http://127.0.0.1:4173',
  logger: false,
  reminders: false,
});
await app.listen({ port: 4173, host: '127.0.0.1' });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
    process.exit();
  });
