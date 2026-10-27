import 'dotenv/config';
import { createApp } from './app';
import { acquireDataLock } from './process-lock';

const release = process.env.DATABASE_URL
  ? async () => {}
  : await acquireDataLock(process.env.DATA_DIR || 'data');
const { app } = await createApp({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.DATA_DIR || 'data',
  origin: process.env.APP_ORIGIN || 'http://localhost:5173',
  secure: process.env.COOKIE_SECURE === 'true',
  setupToken: process.env.SETUP_TOKEN,
  production: process.env.NODE_ENV === 'production',
});
await app.listen({ host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3001) });
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, async () => {
    await app.close();
    await release();
    process.exit(0);
  });
