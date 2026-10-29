import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Context } from '../app';
import { boardAccess, requireThat, studentAccess, hashToken, token, audit } from '../security';
import { sceneChangeSchema, type ElementData } from '../../../../packages/contracts';
import {
  unifyLegacyScenes,
  presentationOf,
  orderCanvas,
} from '../../../../packages/contracts/canvas';

const idParam = (params: unknown, field: string) =>
  z.record(z.string(), z.string()).parse(params)[field];
const uuidParam = (params: unknown, field: string) => z.uuid().parse(idParam(params, field));
export async function boardRoutes({ app, db, config, io }: Context) {
  app.get(
    '/api/v1/boards',
    async (req) =>
      (
        await db.query(
          `SELECT b.*,CASE WHEN b.owner_id=$1 THEN 'admin' ELSE m.permission END AS permission,
    (SELECT count(*)::int FROM pages p WHERE p.board_id=b.id) AS page_count
    FROM boards b LEFT JOIN board_members m ON m.board_id=b.id AND m.user_id=$1 WHERE b.owner_id=$1 OR m.user_id=$1 ORDER BY b.updated_at DESC`,
          [req.user.id],
        )
      ).rows,
  );
  app.post('/api/v1/boards', async (req) => {
    requireThat(req.user.role === 'teacher');
    const input = z
      .object({
        title: z.string().trim().min(1).max(200),
        studentId: z.uuid().nullable().optional(),
      })
      .parse(req.body);
    await studentAccess(db, req.user.id, input.studentId);
    const id = randomUUID();
    return db.transaction(async (tx) => {
      const board = (
        await tx.query(
          'INSERT INTO boards(id,owner_id,title,student_id) VALUES($1,$2,$3,$4) RETURNING *',
          [id, req.user.id, input.title, input.studentId || null],
        )
      ).rows[0];
      await tx.query('INSERT INTO pages(id,board_id,title,position) VALUES($1,$2,$3,0)', [
        randomUUID(),
        id,
        'Страница 1',
      ]);
      if (input.studentId)
        await tx.query(
          "INSERT INTO board_members(board_id,user_id,permission) SELECT $1,user_id,'edit' FROM students WHERE id=$2",
          [id, input.studentId],
        );
      return board;
    });
  });
  app.get('/api/v1/boards/:id', async (req) => {
    const id = uuidParam(req.params, 'id');
    const board = await boardAccess(db, req.user, id);
    return {
      ...board,
      pages: (
        await db.query(
          'SELECT id,board_id,title,position,revision FROM pages WHERE board_id=$1 ORDER BY position,id',
          [id],
        )
      ).rows,
    };
  });
  app.post('/api/v1/boards/:id/canvas', async (req) => {
    const id = uuidParam(req.params, 'id');
    const accessible = await boardAccess(db, req.user, id);
    if (accessible.canvas_page_id) return accessible;
    requireThat(
      accessible.owner_id === req.user.id,
      409,
      'Преподавателю нужно один раз открыть доску для перехода на общий холст',
    );
    const board = await db.transaction(async (tx) => {
      const pages = (
        await tx.query('SELECT * FROM pages WHERE board_id=$1 ORDER BY position,id FOR UPDATE', [
          id,
        ])
      ).rows;
      const board = (await tx.query('SELECT * FROM boards WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (board.canvas_page_id) return board;
      requireThat(pages.length, 404, 'Холст не найден');
      const primary = pages[0],
        scene = unifyLegacyScenes(pages);
      requireThat(
        scene.length <= 15000,
        413,
        'Слишком много объектов для объединения. Исходные страницы сохранены',
      );
      // Preserve the original first page as a recoverable version. Other source pages stay intact.
      if (pages.length > 1 || primary.scene.length) {
        await tx.query(
          'INSERT INTO snapshots(id,page_id,revision,scene,author_id) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(), primary.id, primary.revision, JSON.stringify(primary.scene), req.user.id],
        );
        const prior = new Map<string, any>(primary.scene.map((e: any) => [e.id, e]));
        for (const e of scene)
          if (prior.has(e.id)) e.version = Math.max(e.version, prior.get(e.id).version + 1);
        await tx.query('UPDATE pages SET scene=$2,revision=revision+1,title=$3 WHERE id=$1', [
          primary.id,
          JSON.stringify(scene),
          'Холст',
        ]);
      }
      await tx.query('UPDATE boards SET canvas_page_id=$2,updated_at=now() WHERE id=$1', [
        id,
        primary.id,
      ]);
      await audit(tx, req.user.id, 'board.canvas-migrated', id);
      return { ...board, canvas_page_id: primary.id };
    });
    io.to(`board:${id}`).emit('canvas-updated', { boardId: id });
    return { ...board, permission: accessible.permission };
  });
  app.patch('/api/v1/boards/:id', async (req) => {
    const id = uuidParam(req.params, 'id');
    const board = await boardAccess(db, req.user, id);
    const input = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        archived: z.boolean().optional(),
        background: z.enum(['white', 'grid', 'ruled', 'dots']).optional(),
      })
      .refine((value) => Object.values(value).some((field) => field !== undefined), {
        message: 'Укажите изменяемое поле доски',
      })
      .parse(req.body);
    if (input.title !== undefined || input.archived !== undefined)
      requireThat(board.owner_id === req.user.id);
    if (input.background !== undefined) await boardAccess(db, req.user, id, true);
    const updated = (
      await db.query(
        'UPDATE boards SET title=COALESCE($2,title),archived=COALESCE($3,archived),background=COALESCE($4,background),updated_at=now() WHERE id=$1 RETURNING *',
        [id, input.title ?? null, input.archived ?? null, input.background ?? null],
      )
    ).rows[0];
    await audit(
      db,
      req.user.id,
      input.background !== undefined
        ? 'board.background-changed'
        : input.archived === undefined
          ? 'board.renamed'
          : input.archived
            ? 'board.archived'
            : 'board.unarchived',
      id,
    );
    if (input.background !== undefined)
      io.to(`board:${id}`).emit('board-background', {
        boardId: id,
        background: updated.background,
      });
    if (input.archived)
      for (const socket of io.sockets.sockets.values())
        if (socket.data.boardId === id) {
          socket.emit('access-revoked');
          socket.disconnect(true);
        }
    return updated;
  });
  app.post('/api/v1/boards/:id/pages', async (req) => {
    const id = uuidParam(req.params, 'id');
    const board = await boardAccess(db, req.user, id, true);
    requireThat(board.owner_id === req.user.id);
    requireThat(
      !board.canvas_page_id,
      409,
      'На этой доске используется единый холст. Добавляйте материалы на него',
    );
    const { title } = z.object({ title: z.string().trim().min(1).max(200) }).parse(req.body);
    const page = (
      await db.query(
        'INSERT INTO pages(id,board_id,title,position) SELECT $1,$2,$3,COALESCE(max(position),-1)+1 FROM pages WHERE board_id=$2 RETURNING id,board_id,title,position,revision',
        [randomUUID(), id, title],
      )
    ).rows[0];
    io.to(`board:${id}`).emit('pages-updated', { boardId: id });
    return page;
  });
  app.patch('/api/v1/pages/:id', async (req) => {
    const id = uuidParam(req.params, 'id');
    const page = (await db.query('SELECT board_id FROM pages WHERE id=$1', [id])).rows[0];
    requireThat(page, 404, 'Страница не найдена');
    const board = await boardAccess(db, req.user, page.board_id, true);
    requireThat(board.owner_id === req.user.id);
    const input = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        position: z.number().int().min(0).max(1000).optional(),
      })
      .parse(req.body);
    await db.query(
      'UPDATE pages SET title=COALESCE($2,title),position=COALESCE($3,position) WHERE id=$1',
      [id, input.title || null, input.position ?? null],
    );
    io.to(`board:${board.id}`).emit('pages-updated', { boardId: board.id });
    return { ok: true };
  });
  app.delete('/api/v1/pages/:id', async (req) => {
    const id = uuidParam(req.params, 'id');
    return db.transaction(async (tx) => {
      const page = (await tx.query('SELECT * FROM pages WHERE id=$1 FOR UPDATE', [id])).rows[0];
      requireThat(page, 404, 'Страница не найдена');
      const board = await boardAccess(tx, req.user, page.board_id, true);
      requireThat(board.owner_id === req.user.id);
      requireThat(!board.canvas_page_id, 409, 'Единый холст нельзя удалить как страницу');
      await tx.query('SELECT id FROM boards WHERE id=$1 FOR UPDATE', [board.id]);
      const count = (
        await tx.query('SELECT count(*)::int AS n FROM pages WHERE board_id=$1', [board.id])
      ).rows[0].n;
      requireThat(count > 1, 400, 'На доске должна остаться хотя бы одна страница');
      await tx.query('DELETE FROM pages WHERE id=$1', [id]);
      io.to(`board:${board.id}`).emit('pages-updated', { boardId: board.id });
      return { ok: true };
    });
  });
  app.get('/api/v1/pages/:id/snapshot', async (req) => {
    const id = uuidParam(req.params, 'id');
    const page = (await db.query('SELECT * FROM pages WHERE id=$1', [id])).rows[0];
    requireThat(page, 404, 'Страница не найдена');
    await boardAccess(db, req.user, page.board_id);
    return page;
  });
  app.post('/api/v1/pages/:id/operations', async (req) => {
    const pageId = uuidParam(req.params, 'id');
    const input = sceneChangeSchema.parse(req.body);
    requireThat(
      JSON.stringify(input).length < 3_000_000,
      413,
      'Слишком много изменений за один раз',
    );
    for (const { element: e } of input.changes) {
      requireThat(
        !['iframe', 'embeddable', 'magicframe', 'selection'].includes(e.type),
        400,
        'Внешние встраиваемые объекты не поддерживаются',
      );
      for (const key of ['x', 'y', 'width', 'height'])
        requireThat(
          typeof e[key] === 'number' &&
            Number.isFinite(e[key]) &&
            Math.abs(e[key] as number) <= 1e7,
          400,
          'Некорректные координаты',
        );
      requireThat(
        typeof e.text !== 'string' || e.text.length <= 20000,
        400,
        'Текстовый блок больше 20 000 символов',
      );
      requireThat(
        !e.link || (typeof e.link === 'string' && /^https?:\/\//.test(e.link)),
        400,
        'Недопустимая ссылка',
      );
      const rich = (e.customData as any)?.richText;
      if (rich)
        z.object({
          text: z.string().max(20000),
          family: z.string().max(64),
          fontSize: z.number().finite().min(8).max(200),
          bold: z.boolean(),
          italic: z.boolean(),
          underline: z.boolean(),
          align: z.enum(['left', 'center', 'right']),
          color: z.string().max(80),
          maxWidth: z.number().finite().positive().max(1800).optional(),
          containerId: z.string().max(128).optional(),
        }).parse(rich);
    }
    const result = await db.transaction(async (tx) => {
      const page = (await tx.query('SELECT * FROM pages WHERE id=$1 FOR UPDATE', [pageId])).rows[0];
      requireThat(page, 404, 'Страница не найдена');
      const board = await boardAccess(tx, req.user, page.board_id, true);
      requireThat(
        !board.canvas_page_id || board.canvas_page_id === pageId,
        409,
        'Доска перешла на единый холст. Перезагрузите её перед продолжением',
      );
      const previous = (
        await tx.query('SELECT result FROM operations WHERE page_id=$1 AND operation_id=$2', [
          pageId,
          input.operationId,
        ])
      ).rows[0];
      if (previous) return { ...previous.result, duplicate: true };
      const scene = new Map<string, ElementData>(page.scene.map((e: ElementData) => [e.id, e]));
      const accepted: ElementData[] = [],
        conflicts: ElementData[] = [];
      for (const change of input.changes) {
        const current = scene.get(change.element.id);
        if ((current?.version ?? null) !== change.baseVersion) {
          if (current) conflicts.push(current);
          continue;
        }
        if (current)
          requireThat(
            change.element.version > current.version,
            400,
            'Версия объекта должна увеличиваться',
          );
        if (change.element.type === 'image' && !change.element.isDeleted) {
          const file = (
            await tx.query('SELECT id FROM files WHERE board_id=$1 AND excalidraw_id=$2', [
              page.board_id,
              change.element.fileId,
            ])
          ).rows[0];
          requireThat(file, 400, 'Изображение ещё не загружено. Повторите сохранение');
        }
        scene.set(change.element.id, change.element);
        accepted.push(change.element);
      }
      requireThat(scene.size <= 15000, 413, 'Достигнут лимит холста: 15 000 объектов');
      for (const e of accepted) {
        const deck = presentationOf(e);
        if (!deck || e.isDeleted) continue;
        const metadata = z
          .object({
            sourceId: z.uuid(),
            title: z.string().min(1).max(250),
            slideIndex: z.number().int().min(0).max(29),
            slides: z
              .array(
                z.object({
                  fileId: z.string().min(1).max(128),
                  width: z.number().positive().finite().max(20000),
                  height: z.number().positive().finite().max(20000),
                }),
              )
              .min(1)
              .max(30),
          })
          .parse(deck);
        requireThat(
          metadata.slideIndex < metadata.slides.length &&
            e.fileId === metadata.slides[metadata.slideIndex].fileId,
          400,
          'Некорректный слайд презентации',
        );
        const ids = [...new Set(metadata.slides.map((s) => s.fileId))];
        const assets = (
          await tx.query(
            'SELECT excalidraw_id FROM files WHERE board_id=$1 AND excalidraw_id=ANY($2::text[])',
            [page.board_id, ids],
          )
        ).rows;
        requireThat(assets.length === ids.length, 400, 'Не все слайды презентации сохранены');
      }
      const revision = page.revision + (accepted.length ? 1 : 0);
      if (accepted.length) {
        await tx.query(
          'INSERT INTO snapshots(id,page_id,revision,scene,author_id) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(), pageId, page.revision, JSON.stringify(page.scene), req.user.id],
        );
        await tx.query('UPDATE pages SET scene=$2,revision=$3 WHERE id=$1', [
          pageId,
          JSON.stringify(orderCanvas([...scene.values()])),
          revision,
        ]);
        await tx.query('UPDATE boards SET updated_at=now() WHERE id=$1', [page.board_id]);
        await tx.query(
          'DELETE FROM snapshots WHERE page_id=$1 AND label IS NULL AND id NOT IN (SELECT id FROM snapshots WHERE page_id=$1 AND label IS NULL ORDER BY created_at DESC LIMIT 50)',
          [pageId],
        );
      }
      const result = {
        operationId: input.operationId,
        pageId,
        revision,
        elements: accepted,
        conflicts,
      };
      await tx.query(
        'INSERT INTO operations(page_id,operation_id,user_id,result) VALUES($1,$2,$3,$4)',
        [pageId, input.operationId, req.user.id, JSON.stringify(result)],
      );
      return result;
    });
    if (!result.duplicate && result.elements.length)
      io.to(`page:${pageId}`).emit('scene-update', result);
    return result;
  });
  app.get('/api/v1/pages/:id/history', async (req) => {
    const id = uuidParam(req.params, 'id');
    const page = (await db.query('SELECT board_id FROM pages WHERE id=$1', [id])).rows[0];
    requireThat(page, 404, 'Страница не найдена');
    const b = await boardAccess(db, req.user, page.board_id);
    requireThat(b.owner_id === req.user.id);
    return (
      await db.query(
        `SELECT s.id,s.revision,s.created_at,s.label,s.lesson_session_id,u.name AS author,r.data->>'title' AS lesson_title FROM snapshots s JOIN users u ON u.id=s.author_id LEFT JOIN lesson_sessions ls ON ls.id=s.lesson_session_id LEFT JOIN records r ON r.id=ls.lesson_id WHERE page_id=$1 ORDER BY s.created_at DESC LIMIT 150`,
        [id],
      )
    ).rows;
  });
  app.get('/api/v1/pages/:id/history/:snapshotId', async (req) => {
    const id = uuidParam(req.params, 'id');
    const page = (await db.query('SELECT board_id FROM pages WHERE id=$1', [id])).rows[0];
    requireThat(page, 404, 'Холст не найден');
    const board = await boardAccess(db, req.user, page.board_id);
    requireThat(board.owner_id === req.user.id);
    const snapshot = (
      await db.query('SELECT * FROM snapshots WHERE id=$1 AND page_id=$2', [
        uuidParam(req.params, 'snapshotId'),
        id,
      ])
    ).rows[0];
    requireThat(snapshot, 404, 'Версия не найдена');
    return snapshot;
  });
  app.post('/api/v1/pages/:id/restore', async (req) => {
    const id = uuidParam(req.params, 'id');
    const input = z
      .object({ snapshotId: z.uuid(), expectedRevision: z.number().int() })
      .parse(req.body);
    const result = await db.transaction(async (tx) => {
      const p = (await tx.query('SELECT * FROM pages WHERE id=$1 FOR UPDATE', [id])).rows[0];
      requireThat(p, 404, 'Страница не найдена');
      const b = await boardAccess(tx, req.user, p.board_id, true);
      requireThat(b.owner_id === req.user.id);
      requireThat(
        p.revision === input.expectedRevision,
        409,
        'Доска изменилась. Обновите историю перед восстановлением',
      );
      const s = (
        await tx.query('SELECT scene FROM snapshots WHERE id=$1 AND page_id=$2', [
          input.snapshotId,
          id,
        ])
      ).rows[0];
      requireThat(s, 404, 'Версия не найдена');
      const current = new Map<string, ElementData>(p.scene.map((e: ElementData) => [e.id, e]));
      const restored = new Map<string, ElementData>(s.scene.map((e: ElementData) => [e.id, e]));
      const elements = [...new Set([...current.keys(), ...restored.keys()])].map((key) => ({
        ...(restored.get(key) || current.get(key)!),
        isDeleted: !restored.has(key) || restored.get(key)!.isDeleted,
        version: Math.max(current.get(key)?.version || 0, restored.get(key)?.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 2 ** 30),
        updated: Date.now(),
      }));
      await tx.query(
        'INSERT INTO snapshots(id,page_id,revision,scene,author_id) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), id, p.revision, JSON.stringify(p.scene), req.user.id],
      );
      await tx.query('UPDATE pages SET scene=$2,revision=revision+1 WHERE id=$1', [
        id,
        JSON.stringify(elements),
      ]);
      await tx.query('INSERT INTO audit_events(id,user_id,action,target_id) VALUES($1,$2,$3,$4)', [
        randomUUID(),
        req.user.id,
        'page.restore',
        id,
      ]);
      return {
        pageId: id,
        revision: p.revision + 1,
        elements,
        operationId: randomUUID(),
        conflicts: [],
      };
    });
    io.to(`page:${id}`).emit('scene-update', result);
    return result;
  });
  app.get('/api/v1/boards/:id/invites', async (req) => {
    const id = uuidParam(req.params, 'id');
    const b = await boardAccess(db, req.user, id);
    requireThat(b.owner_id === req.user.id);
    return (
      await db.query(
        'SELECT id,permission,expires_at,revoked,uses,max_uses FROM invites WHERE board_id=$1 ORDER BY created_at DESC',
        [id],
      )
    ).rows;
  });
  app.post('/api/v1/boards/:id/invites', async (req) => {
    const id = uuidParam(req.params, 'id');
    const b = await boardAccess(db, req.user, id, true);
    requireThat(b.owner_id === req.user.id);
    const input = z
      .object({
        permission: z.enum(['view', 'edit']),
        hours: z.number().int().min(1).max(168),
        maxUses: z.number().int().min(1).max(20),
      })
      .parse(req.body);
    const raw = token();
    const inviteId = randomUUID();
    await db.query(
      'INSERT INTO invites(id,owner_id,board_id,token_hash,permission,expires_at,max_uses) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        inviteId,
        req.user.id,
        id,
        hashToken(raw),
        input.permission,
        new Date(Date.now() + input.hours * 3600000).toISOString(),
        input.maxUses,
      ],
    );
    await audit(db, req.user.id, 'invite.created', inviteId);
    return { id: inviteId, url: `${config.origin}/join#${raw}` };
  });
  app.delete('/api/v1/invites/:id', async (req) => {
    const id = uuidParam(req.params, 'id');
    requireThat(req.user.role === 'teacher');
    const i = (
      await db.query('UPDATE invites SET revoked=true WHERE id=$1 AND owner_id=$2 RETURNING id', [
        id,
        req.user.id,
      ])
    ).rows[0];
    requireThat(i, 404, 'Приглашение не найдено');
    await audit(db, req.user.id, 'invite.revoked', id);
    const sessions = (await db.query('SELECT user_id FROM sessions WHERE invite_id=$1', [id])).rows;
    for (const s of sessions) io.in(`user:${s.user_id}`).emit('access-revoked');
    for (const s of sessions) io.in(`user:${s.user_id}`).disconnectSockets();
    return { ok: true };
  });
  app.get('/api/v1/boards/:id/members', async (req) => {
    const id = uuidParam(req.params, 'id');
    const b = await boardAccess(db, req.user, id);
    requireThat(b.owner_id === req.user.id);
    return (
      await db.query(
        'SELECT m.user_id,m.permission,u.name,u.role FROM board_members m JOIN users u ON u.id=m.user_id WHERE m.board_id=$1',
        [id],
      )
    ).rows;
  });
  app.delete('/api/v1/boards/:id/members/:userId', async (req) => {
    const id = uuidParam(req.params, 'id'),
      uid = uuidParam(req.params, 'userId');
    const b = await boardAccess(db, req.user, id);
    requireThat(b.owner_id === req.user.id);
    await db.query('DELETE FROM board_members WHERE board_id=$1 AND user_id=$2', [id, uid]);
    await audit(db, req.user.id, 'member.removed', id);
    for (const socket of io.sockets.sockets.values())
      if (socket.data.boardId === id && socket.data.user.id === uid) {
        socket.emit('access-revoked');
        socket.disconnect(true);
      }
    return { ok: true };
  });
}
