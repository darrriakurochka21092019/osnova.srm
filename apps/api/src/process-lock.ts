import { open, readFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
export async function acquireDataLock(dataDir: string) {
  await mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, '.process-lock');
  try {
    const pid = Number(await readFile(file, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ESRCH') alive = true;
    }
    if (alive) throw new Error('DATA_DIR занят работающим приложением. Сначала остановите его.');
    await unlink(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const handle = await open(file, 'wx', 0o600);
  await handle.writeFile(String(process.pid));
  await handle.close();
  return async () => {
    await unlink(file).catch(() => {});
  };
}
