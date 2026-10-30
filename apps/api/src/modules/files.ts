import { randomUUID, createHash } from 'node:crypto';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import { imageSize } from 'image-size';
import type { Context } from '../app';
import { boardAccess, detectMime, requireThat, audit } from '../security';
import { canReadRecord } from './records';

export async function fileRoutes({ app, db, config }: Context) {
  app.post(
    '/api/v1/files',
    { config: { rateLimit: { max: 90, timeWindow: '1 minute' } } },
    async (req) => {
      const part = await req.file();
      requireThat(part, 400, 'Выберите файл');
      if (!part) return;
      const buffer = await part.toBuffer();
      requireThat(buffer.length <= 25 * 1024 * 1024, 413, 'Файл больше 25 МБ');
      const mime = detectMime(buffer);
      requireThat(mime, 415, 'Можно загрузить PDF, PNG, JPG или WebP');
      requireThat(mime === part.mimetype, 415, 'Содержимое файла не совпадает с его типом');
      if (mime === 'application/pdf') {
        try {
          const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
          requireThat(pdf.getPageCount() <= 30, 413, 'Разделите PDF: не больше 30 страниц');
          requireThat(
            pdf.getPages().every((p) => p.getWidth() * p.getHeight() * 1.75 ** 2 <= 40_000_000),
            413,
            'PDF содержит слишком большую страницу',
          );
        } catch (e) {
          if ((e as any).statusCode) throw e;
          requireThat(false, 400, 'PDF повреждён или защищён паролем');
        }
      } else {
        try {
          const size = imageSize(buffer);
          requireThat(
            size.width && size.height && size.width * size.height <= 40_000_000,
            413,
            'Изображение больше 40 мегапикселей',
          );
        } catch (e) {
          if ((e as any).statusCode) throw e;
          requireThat(false, 400, 'Изображение повреждено');
        }
      }
      const fields = part.fields as any;
      const boardId = fields.boardId?.value ? z.uuid().parse(fields.boardId.value) : null;
      const excalidrawId = fields.excalidrawId?.value
        ? z.string().max(128).parse(fields.excalidrawId.value)
        : null;
      if (boardId) await boardAccess(db, req.user, boardId, true);
      else requireThat(req.user.role !== 'guest');
      const usage = (
        await db.query(
          'SELECT COALESCE(sum(f.size),0)::bigint AS total FROM files f JOIN users u ON u.id=f.owner_id WHERE u.id=$1 OR u.owner_id=$1',
          [req.user.role === 'teacher' ? req.user.id : req.user.owner_id],
        )
      ).rows[0];
      requireThat(
        Number(usage.total) + buffer.length <= 2 * 1024 ** 3,
        413,
        'Лимит файлов пространства — 2 ГБ. Обратитесь к преподавателю',
      );
      if (excalidrawId) {
        requireThat(boardId, 400, 'Изображение должно принадлежать доске');
        const existing = (
          await db.query(
            'SELECT id,name,mime,size,excalidraw_id,checksum FROM files WHERE board_id=$1 AND excalidraw_id=$2',
            [boardId, excalidrawId],
          )
        ).rows[0];
        if (existing) {
          requireThat(
            existing.checksum === createHash('sha256').update(buffer).digest('hex'),
            409,
            'Идентификатор изображения уже связан с другим файлом',
          );
          const { checksum, ...metadata } = existing;
          return metadata;
        }
      }
      const id = randomUUID(),
        key = randomUUID(),
        name = part.filename.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 200) || 'Материал';
      const filePath = path.join(config.dataDir, 'files', key);
      await writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
      try {
        return (
          await db.query(
            'INSERT INTO files(id,owner_id,board_id,name,mime,size,storage_key,checksum,excalidraw_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,name,mime,size,excalidraw_id,board_id',
            [
              id,
              req.user.id,
              boardId,
              name,
              mime,
              buffer.length,
              key,
              createHash('sha256').update(buffer).digest('hex'),
              excalidrawId,
            ],
          )
        ).rows[0];
      } catch (e) {
        await unlink(filePath);
        throw e;
      }
    },
  );
  app.get('/api/v1/boards/:id/files', async (req) => {
    const id = z.uuid().parse((req.params as any).id);
    await boardAccess(db, req.user, id);
    return (
      await db.query('SELECT id,name,mime,size,excalidraw_id FROM files WHERE board_id=$1', [id])
    ).rows;
  });
  for (const metadata of [false, true])
    app.get(`/api/v1/files/:id${metadata ? '/meta' : ''}`, async (req, reply) => {
      const id = z.uuid().parse((req.params as any).id);
      const f = (
        await db.query(
          'SELECT f.*,u.owner_id AS user_owner FROM files f JOIN users u ON u.id=f.owner_id WHERE f.id=$1',
          [id],
        )
      ).rows[0];
      requireThat(f, 404, 'Файл не найден');
      let allowed =
        f.owner_id === req.user.id || (req.user.role === 'teacher' && f.user_owner === req.user.id);
      if (!allowed && f.board_id) {
        await boardAccess(db, req.user, f.board_id);
        allowed = true;
      }
      if (!allowed && req.user.role === 'student') {
        const records = (
          await db.query(
            "SELECT * FROM records WHERE owner_id=$1 AND (data->'fileIds' ? $2 OR data->'answerFileIds' ? $2)",
            [req.user.owner_id, id],
          )
        ).rows;
        for (const r of records)
          if (await canReadRecord(db, req.user, r)) {
            allowed = true;
            break;
          }
      }
      requireThat(allowed, 404, 'Файл не найден или доступ закрыт');
      if (metadata) {
        reply.header('Cache-Control', 'private, no-store');
        return { id: f.id, name: f.name, mime: f.mime, size: f.size };
      }
      await audit(db, req.user.id, 'file.read', id);
      const data = await readFile(path.join(config.dataDir, 'files', f.storage_key));
      reply
        .type(f.mime)
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff');
      const download = (req.query as any).download === '1';
      reply.header(
        'Content-Disposition',
        `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      );
      return reply.send(data);
    });
}
