import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir, cp, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const source = process.argv[2],
  destination = process.argv[3];
if (!source || !destination)
  throw new Error('Команда: npm run restore -- <папка_копии> <НОВАЯ_пустая_папка_данных>');
const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
if (manifest.engine !== 'pglite' || manifest.version !== 1)
  throw new Error('Неизвестный формат копии');
const target = path.resolve(destination);
await mkdir(target, { recursive: true });
if ((await readdir(target)).length)
  throw new Error('Папка назначения должна быть пустой. Существующие данные не перезаписываются.');
const bytes = await readFile(path.join(source, 'database.tar.gz'));
const checksum = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
if (checksum(bytes) !== manifest.databaseSha256)
  throw new Error('Контрольная сумма базы не совпадает');
for (const f of manifest.files) {
  if (path.basename(f.name) !== f.name) throw new Error('Некорректное имя в копии');
  if (checksum(await readFile(path.join(source, 'files', f.name))) !== f.sha256)
    throw new Error(`Повреждён файл: ${f.name}`);
}
try {
  const db = new PGlite({
    dataDir: path.join(target, 'postgres'),
    loadDataDir: new Blob([new Uint8Array(bytes)]),
  });
  await db.waitReady;
  await db.close();
  await cp(path.join(source, 'files'), path.join(target, 'files'), { recursive: true });
  console.log(`Восстановлено в ${target}. Укажите эту папку в DATA_DIR.`);
} catch (e) {
  await rm(target, { recursive: true, force: true });
  throw e;
}
