import 'dotenv/config';
import { mkdir, writeFile, cp, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { openDatabase } from '../apps/api/src/db';
import { acquireDataLock } from '../apps/api/src/process-lock';
if (process.env.DATABASE_URL)
  throw new Error('Для PostgreSQL используйте pg_dump и копию файлов: docs/06_OPERATIONS.md.');
const data = path.resolve(process.env.DATA_DIR || 'data'),
  release = await acquireDataLock(data);
try {
  const target = path.resolve('backups', new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(target, { recursive: true });
  const db = await openDatabase(undefined, path.join(data, 'postgres'));
  let dump: Blob;
  try {
    dump = await db.dump!();
  } finally {
    await db.close();
  }
  const bytes = new Uint8Array(await dump.arrayBuffer());
  await writeFile(path.join(target, 'database.tar.gz'), bytes);
  await cp(path.join(data, 'files'), path.join(target, 'files'), { recursive: true });
  const files = [];
  for (const name of await readdir(path.join(target, 'files'))) {
    const bytes = await readFile(path.join(target, 'files', name));
    files.push({ name, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(
    path.join(target, 'manifest.json'),
    JSON.stringify(
      {
        version: 1,
        engine: 'pglite',
        createdAt: new Date().toISOString(),
        databaseSha256: createHash('sha256').update(bytes).digest('hex'),
        files,
      },
      null,
      2,
    ),
  );
  console.log(`Резервная копия создана: ${target}`);
} finally {
  await release();
}
