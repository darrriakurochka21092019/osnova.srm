import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Context } from '../app';
import type { User } from '../../../../packages/contracts';
import { recordSchemas } from '../../../../packages/contracts';
import { authenticate, audit, hashToken, requireThat, token } from '../security';
import { ensureClassroom, classroomAccess, attachLessonRoom, lessonStudentIds } from '../rooms';
import { createSession } from './auth';
import { canReadRecord, notify } from './records';

const idOf = (req: any) => z.uuid().parse(req.params.id);
const memberRows = async (
  ctx: Context,
  id: string,
  queryable = ctx.db as import('../db').Queryable,
) =>
  (
    await queryable.query(
      `SELECT s.id,s.user_id,s.name,s.grade,s.subject,s.color,s.status,m.permission
  FROM classroom_members m JOIN students s ON s.id=m.student_id WHERE m.classroom_id=$1 ORDER BY s.name`,
      [id],
    )
  ).rows;
const publicLesson = (r: any, owner: boolean) =>
  !r || owner
    ? r
    : {
        ...r,
        data: Object.fromEntries(
          ['title', 'start', 'duration', 'status', 'subject', 'boardId', 'classroomId'].map((k) => [
            k,
            r.data[k],
          ]),
        ),
      };
const publicSession = (s: any, owner: boolean) => {
  if (!s) return null;
  const { private_note, ...rest } = s;
  return owner ? s : rest;
};
export async function classroomPresence(ctx: Context, id: string) {
  const sockets = await ctx.io.in(`classroom:${id}`).fetchSockets();
  const users = new Map<string, any>();
  for (const s of sockets) {
    const u = s.data.user;
    const before = users.get(u.id);
    users.set(u.id, {
      id: u.id,
      name: s.data.classroomName || u.name,
      role: u.role,
      studentId: s.data.classroomStudentId,
      stage: before?.stage === 'lesson' ? 'lesson' : s.data.classroomStage || 'lobby',
      handRaised: !!(before?.handRaised || s.data.handRaised),
    });
  }
  return [...users.values()];
}
async function activeSession(ctx: Context, id: string) {
  return (
    (
      await ctx.db.query(
        `SELECT s.*,r.data->>'title' AS title FROM lesson_sessions s JOIN records r ON r.id=s.lesson_id WHERE s.classroom_id=$1 AND s.ended_at IS NULL`,
        [id],
      )
    ).rows[0] || null
  );
}
export async function broadcastClassroom(ctx: Context, id: string) {
  ctx.io.to(`classroom:${id}`).emit('classroom-state', {
    participants: await classroomPresence(ctx, id),
    activeSession: publicSession(await activeSession(ctx, id), false),
  });
}
async function roomDetails(ctx: Context, room: any, user?: User | null, lessonId?: string) {
  const owner = room.owner_id === user?.id,
    students = await memberRows(ctx, room.id);
  const sessions = (
    await ctx.db.query(
      `SELECT s.*,r.data->>'title' AS title FROM lesson_sessions s JOIN records r ON r.id=s.lesson_id WHERE s.classroom_id=$1 ORDER BY CASE WHEN s.lesson_id=$2 THEN 0 ELSE 1 END,s.started_at DESC LIMIT 30`,
      [room.id, lessonId || null],
    )
  ).rows;
  const live = sessions.find((s) => !s.ended_at) || null;
  const lessons = (
    await ctx.db.query(
      `SELECT * FROM records WHERE owner_id=$1 AND kind='lesson' AND data->>'classroomId'=$2 ORDER BY data->>'start'`,
      [room.owner_id, room.id],
    )
  ).rows;
  let lesson = lessonId
    ? lessons.find((l) => l.id === lessonId)
    : live
      ? lessons.find((l) => l.id === live.lesson_id)
      : undefined;
  if (lessonId) requireThat(lesson, 404, 'Занятие не найдено в этой комнате');
  lesson ||=
    lessons.find(
      (l) =>
        ['planned', 'rescheduled', 'live'].includes(l.data.status) &&
        new Date(l.data.start).getTime() >= Date.now() - 4 * 3600000,
    ) ||
    [...lessons]
      .reverse()
      .find((l) => ['planned', 'rescheduled', 'live'].includes(l.data.status)) ||
    null;
  const invite = (await ctx.db.query('SELECT revoked FROM invites WHERE id=$1', [room.invite_id]))
    .rows[0];
  const personalLinks =
    owner && room.kind === 'group'
      ? (
          await ctx.db.query(
            `SELECT c.id,c.link_token,s.id AS student_id,s.name,s.status,i.revoked FROM classrooms c JOIN invites i ON i.id=c.invite_id JOIN students s ON s.id::text=c.member_key WHERE c.owner_id=$1 AND s.id=ANY($2::uuid[])`,
            [room.owner_id, students.map((s) => s.id)],
          )
        ).rows.map((r) => ({
          roomId: r.id,
          studentId: r.student_id,
          name: r.name,
          url: `${ctx.config.origin}/learn/${r.id}#${r.link_token}`,
          active: !r.revoked && r.status === 'active',
        }))
      : undefined;
  return {
    id: room.id,
    owner_id: room.owner_id,
    board_id: room.board_id,
    title: room.title,
    kind: room.kind,
    permission: room.permission || 'edit',
    students,
    lesson: publicLesson(lesson, owner),
    activeSession: publicSession(live, owner),
    sessions: sessions.map((s) => publicSession(s, owner)),
    participants: await classroomPresence(ctx, room.id),
    ...(owner
      ? room.kind === 'individual'
        ? {
            link: `${ctx.config.origin}/learn/${room.id}#${room.link_token}`,
            linkActive:
              !invite?.revoked && !room.archived && students.some((s) => s.status === 'active'),
          }
        : { memberLinks: personalLinks }
      : {}),
  };
}
async function validLink(ctx: Context, id: string, raw: string) {
  const room = (
    await ctx.db.query(
      `SELECT c.* FROM classrooms c JOIN invites i ON i.id=c.invite_id JOIN boards b ON b.id=c.board_id
    WHERE c.id=$1 AND i.token_hash=$2 AND i.revoked=false AND i.expires_at>now() AND b.archived=false`,
      [id, hashToken(raw)],
    )
  ).rows[0];
  requireThat(room, 410, 'Эта ссылка недействительна. Попросите преподавателя прислать новую');
  requireThat(
    room.kind === 'individual',
    410,
    'Для мини-группы используйте личную ссылку на занятия, полученную от преподавателя',
  );
  requireThat(
    (await memberRows(ctx, id)).some((s) => s.status === 'active'),
    410,
    'Доступ к занятиям приостановлен',
  );
  return room;
}
/** A student's permanent link also leads to their scheduled mini-group lesson. */
async function resolveEntry(ctx: Context, source: any) {
  if (source.kind !== 'individual') return source;
  const students = await memberRows(ctx, source.id),
    sid = students[0].id;
  const live = (
    await ctx.db.query(
      `SELECT c.* FROM classrooms c JOIN classroom_members m ON m.classroom_id=c.id
    JOIN lesson_sessions s ON s.classroom_id=c.id AND s.ended_at IS NULL WHERE m.student_id=$1 ORDER BY s.started_at DESC LIMIT 1`,
      [sid],
    )
  ).rows[0];
  if (live) return live;
  const all = (
    await ctx.db.query(
      `SELECT * FROM records WHERE owner_id=$1 AND kind='lesson' AND data->>'status' IN ('planned','rescheduled') ORDER BY data->>'start'`,
      [source.owner_id],
    )
  ).rows;
  const lesson = all.find(
    (r) =>
      lessonStudentIds(r).includes(sid) &&
      new Date(r.data.start).getTime() >= Date.now() - 4 * 3600000,
  );
  if (!lesson) return source;
  const linked = await ctx.db.transaction((tx) => attachLessonRoom(tx, lesson));
  return (await ctx.db.query('SELECT * FROM classrooms WHERE id=$1', [linked.data.classroomId]))
    .rows[0];
}
async function milestone(tx: any, room: any, sessionId: string, authorId: string, label: string) {
  const p = (
    await tx.query(
      'SELECT p.*,b.background FROM pages p JOIN boards b ON b.canvas_page_id=p.id WHERE b.id=$1 FOR UPDATE OF p',
      [room.board_id],
    )
  ).rows[0];
  await tx.query(
    'INSERT INTO snapshots(id,page_id,revision,scene,author_id,lesson_session_id,label,background) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      randomUUID(),
      p.id,
      p.revision,
      JSON.stringify(p.scene),
      authorId,
      sessionId,
      label,
      p.background,
    ],
  );
}

export async function classroomRoutes(ctx: Context) {
  const { app, db, io, config } = ctx;
  app.get('/api/v1/classrooms', async (req) => {
    if (req.user.role === 'teacher') {
      const missing = (
        await db.query(
          `SELECT s.id FROM students s WHERE s.owner_id=$1 AND NOT EXISTS(SELECT 1 FROM classrooms c WHERE c.owner_id=$1 AND c.member_key=s.id::text)`,
          [req.user.id],
        )
      ).rows;
      if (missing.length)
        await db.transaction(async (tx) => {
          for (const s of missing) await ensureClassroom(tx, req.user.id, [s.id]);
        });
    }
    const all = (
      await db.query('SELECT * FROM classrooms WHERE owner_id=$1 ORDER BY created_at DESC', [
        req.user.role === 'teacher' ? req.user.id : req.user.owner_id,
      ])
    ).rows;
    const visible: any[] = [];
    for (const c of all) {
      try {
        const access = await classroomAccess(db, req.user, c.id);
        visible.push(await roomDetails(ctx, access, req.user));
      } catch (e) {
        if (req.user.role === 'teacher') throw e;
      }
    }
    return visible;
  });
  app.post('/api/v1/classrooms', async (req) => {
    requireThat(req.user.role === 'teacher');
    const input = z.object({ studentIds: z.array(z.uuid()).min(1).max(20) }).parse(req.body);
    const room = await db.transaction((tx) => ensureClassroom(tx, req.user.id, input.studentIds));
    return roomDetails(ctx, { ...room, permission: 'admin' }, req.user);
  });
  app.post('/api/v1/lessons/:id/classroom', async (req) => {
    const lesson = (
      await db.query(`SELECT * FROM records WHERE id=$1 AND kind='lesson'`, [idOf(req)])
    ).rows[0];
    requireThat(lesson && (await canReadRecord(db, req.user, lesson)), 404, 'Занятие не найдено');
    const linked = await db.transaction((tx) => attachLessonRoom(tx, lesson));
    requireThat(linked.data.classroomId, 400, 'Укажите ученика в занятии');
    return roomDetails(
      ctx,
      await classroomAccess(db, req.user, linked.data.classroomId),
      req.user,
      lesson.id,
    );
  });
  app.get('/api/v1/classrooms/:id', async (req) => {
    const lessonId = z.object({ lessonId: z.uuid().optional() }).parse(req.query).lessonId;
    return roomDetails(ctx, await classroomAccess(db, req.user, idOf(req)), req.user, lessonId);
  });
  const publicOptions = {
    config: {
      public: true,
      rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: (req: any) => req.ip },
    },
  };
  app.post('/api/v1/classrooms/preview', publicOptions, async (req) => {
    const input = z
      .object({ roomId: z.uuid(), token: z.string().min(20).max(100) })
      .parse(req.body);
    const source = await validLink(ctx, input.roomId, input.token),
      target = await resolveEntry(ctx, source);
    return { ...(await roomDetails(ctx, target)), entryStudentId: source.member_key };
  });
  app.post('/api/v1/classrooms/redeem', publicOptions, async (req, reply) => {
    const input = z
      .object({
        roomId: z.uuid(),
        token: z.string().min(20).max(100),
        name: z.string().trim().min(1).max(100),
      })
      .parse(req.body);
    const source = await validLink(ctx, input.roomId, input.token),
      target = await resolveEntry(ctx, source);
    let user: User | null = null;
    try {
      user = await authenticate(db, req.cookies.osnova_session);
    } catch {}
    if (user && user.role !== 'guest') {
      await classroomAccess(db, user, source.id);
      return { roomId: target.id };
    }
    const scoped =
      user &&
      (
        await db.query('SELECT * FROM classroom_guests WHERE user_id=$1 AND source_room_id=$2', [
          user.id,
          source.id,
        ])
      ).rows[0];
    if (!scoped) {
      const uid = randomUUID(),
        students = await memberRows(ctx, source.id);
      await db.transaction(async (tx) => {
        await tx.query(`INSERT INTO users(id,owner_id,role,name) VALUES($1,$2,'guest',$3)`, [
          uid,
          source.owner_id,
          input.name,
        ]);
        await tx.query(
          'INSERT INTO classroom_guests(user_id,source_room_id,student_id) VALUES($1,$2,$3)',
          [uid, source.id, source.kind === 'individual' ? students[0].id : null],
        );
      });
      await createSession(db, reply, uid, config.secure, source.invite_id, 12);
      user = {
        id: uid,
        owner_id: source.owner_id,
        role: 'guest',
        name: input.name,
        email: '',
        settings: {},
      };
    }
    await classroomAccess(db, user!, target.id);
    return { roomId: target.id };
  });
  app.post('/api/v1/classrooms/:id/join', async (req) => {
    const room = await classroomAccess(db, req.user, idOf(req));
    requireThat(!room.archived, 409, 'Комната доступна только как архив материалов');
    requireThat(
      (await memberRows(ctx, room.id)).some((s) => s.status === 'active'),
      409,
      'Занятия с учеником приостановлены',
    );
    const input = z
      .object({ lessonId: z.uuid().optional(), name: z.string().trim().min(1).max(100) })
      .parse(req.body);
    let live = await activeSession(ctx, room.id);
    if (req.user.id === room.owner_id)
      live = await db.transaction(async (tx) => {
        await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [room.owner_id]);
        const current = (
          await tx.query(
            'SELECT * FROM lesson_sessions WHERE classroom_id=$1 AND ended_at IS NULL FOR UPDATE',
            [room.id],
          )
        ).rows[0];
        if (current) {
          requireThat(
            !input.lessonId || current.lesson_id === input.lessonId,
            409,
            'В комнате уже идёт другое занятие',
          );
          return current;
        }
        const other = (
          await tx.query(
            `SELECT s.id FROM lesson_sessions s JOIN classrooms c ON c.id=s.classroom_id WHERE c.owner_id=$1 AND s.ended_at IS NULL`,
            [room.owner_id],
          )
        ).rows[0];
        requireThat(!other, 409, 'Сначала завершите текущее занятие в другой комнате');
        let lesson: any;
        if (input.lessonId) {
          lesson = (
            await tx.query(
              `SELECT * FROM records WHERE id=$1 AND owner_id=$2 AND kind='lesson' FOR UPDATE`,
              [input.lessonId, room.owner_id],
            )
          ).rows[0];
          requireThat(lesson && lesson.data.classroomId === room.id, 404, 'Занятие не найдено');
          requireThat(
            ['planned', 'rescheduled'].includes(lesson.data.status),
            409,
            'Это занятие отменено или уже завершено',
          );
        } else {
          const members = await memberRows(ctx, room.id, tx),
            id = randomUUID();
          const data = recordSchemas.lesson.parse({
            title: `Занятие · ${room.title}`,
            start: new Date().toISOString(),
            duration: 60,
            price: 0,
            status: 'planned',
            boardId: room.board_id,
            classroomId: room.id,
            studentIds: members.slice(1).map((s) => s.id),
            subject: members[0].subject || '',
          });
          lesson = (
            await tx.query(
              `INSERT INTO records(id,kind,owner_id,student_id,data) VALUES($1,'lesson',$2,$3,$4) RETURNING *`,
              [id, room.owner_id, members[0].id, JSON.stringify(data)],
            )
          ).rows[0];
        }
        const sid = randomUUID();
        const started = (
          await tx.query(
            'INSERT INTO lesson_sessions(id,classroom_id,lesson_id) VALUES($1,$2,$3) RETURNING *',
            [sid, room.id, lesson.id],
          )
        ).rows[0];
        await tx.query(
          `UPDATE records SET data=jsonb_set(data,'{status}','"live"'::jsonb),updated_at=now() WHERE id=$1`,
          [lesson.id],
        );
        await milestone(tx, room, sid, req.user.id, 'Перед уроком');
        await audit(tx, req.user.id, 'lesson.started', sid);
        return started;
      });
    if (live)
      await db.query(
        'INSERT INTO lesson_attendance(session_id,user_id,name) VALUES($1,$2,$3) ON CONFLICT(session_id,user_id) DO UPDATE SET name=$3',
        [live.id, req.user.id, input.name],
      );
    await broadcastClassroom(ctx, room.id);
    return { session: publicSession(live, req.user.id === room.owner_id), waiting: !live };
  });
  app.get('/api/v1/classrooms/:id/sessions/:sessionId', async (req) => {
    const room = await classroomAccess(db, req.user, idOf(req));
    const id = z.uuid().parse((req.params as any).sessionId);
    const session = (
      await db.query(
        `SELECT s.*,r.data->>'title' AS title FROM lesson_sessions s JOIN records r ON r.id=s.lesson_id WHERE s.id=$1 AND s.classroom_id=$2`,
        [id, room.id],
      )
    ).rows[0];
    requireThat(session, 404, 'Занятие не найдено');
    const attendance = (
      await db.query(
        'SELECT user_id,name,joined_at FROM lesson_attendance WHERE session_id=$1 ORDER BY joined_at',
        [id],
      )
    ).rows;
    const lesson = (await db.query('SELECT * FROM records WHERE id=$1', [session.lesson_id]))
      .rows[0];
    return {
      session: publicSession(session, req.user.id === room.owner_id),
      attendance,
      lesson: publicLesson(lesson, req.user.id === room.owner_id),
    };
  });
  app.post('/api/v1/classrooms/:id/sessions/:sessionId/end', async (req) => {
    const room = await classroomAccess(db, req.user, idOf(req));
    requireThat(room.owner_id === req.user.id);
    const id = z.uuid().parse((req.params as any).sessionId);
    const result = await db.transaction(async (tx) => {
      const s = (
        await tx.query('SELECT * FROM lesson_sessions WHERE id=$1 AND classroom_id=$2 FOR UPDATE', [
          id,
          room.id,
        ])
      ).rows[0];
      requireThat(s, 404, 'Занятие не найдено');
      if (s.ended_at) return { session: s, changed: false };
      const ended = (
        await tx.query('UPDATE lesson_sessions SET ended_at=now() WHERE id=$1 RETURNING *', [id])
      ).rows[0];
      await tx.query(
        `UPDATE records SET data=jsonb_set(data,'{status}','"completed"'::jsonb),updated_at=now() WHERE id=$1 AND data->>'status'<>'cancelled'`,
        [s.lesson_id],
      );
      await milestone(tx, room, id, req.user.id, 'Завершение урока');
      await audit(tx, req.user.id, 'lesson.ended', id);
      return { session: ended, changed: true };
    });
    if (result.changed) {
      io.to(`classroom:${room.id}`).emit('classroom-ended', { sessionId: id });
      await broadcastClassroom(ctx, room.id);
      for (const s of await memberRows(ctx, room.id))
        await notify(
          ctx,
          room.owner_id,
          s.user_id,
          'Занятие завершено',
          'Доска и материалы сохранены',
          `/lesson/${room.id}/summary/${id}`,
          `lesson-ended:${id}:${s.user_id}`,
        );
    }
    return result.session;
  });
  app.get('/api/v1/classrooms/:id/sessions/:sessionId/materials', async (req) => {
    const room = await classroomAccess(db, req.user, idOf(req)),
      id = z.uuid().parse((req.params as any).sessionId);
    const s = (
      await db.query(
        'SELECT * FROM lesson_sessions WHERE id=$1 AND classroom_id=$2 AND ended_at IS NOT NULL',
        [id, room.id],
      )
    ).rows[0];
    requireThat(s, 404, 'Материалы занятия ещё не сохранены');
    const snapshot = (
      await db.query(
        `SELECT scene,background,created_at FROM snapshots WHERE lesson_session_id=$1 AND label='Завершение урока' ORDER BY created_at DESC LIMIT 1`,
        [id],
      )
    ).rows[0];
    requireThat(snapshot, 404, 'Материалы занятия не найдены');
    const sources = [
      ...new Set<string>(
        snapshot.scene.flatMap((e: any) =>
          [e.customData?.presentation?.sourceId, e.customData?.sourceId].filter(
            (id: unknown) => z.uuid().safeParse(id).success,
          ),
        ),
      ),
    ];
    const files = sources.length
      ? (
          await db.query(
            'SELECT id,name,mime,size,excalidraw_id,board_id FROM files WHERE board_id=$1 AND id=ANY($2::uuid[])',
            [room.board_id, sources],
          )
        ).rows
      : [];
    return { ...snapshot, files };
  });
  app.patch('/api/v1/classrooms/:id/sessions/:sessionId/summary', async (req) => {
    const room = await classroomAccess(db, req.user, idOf(req));
    requireThat(room.owner_id === req.user.id);
    const id = z.uuid().parse((req.params as any).sessionId);
    const input = z
      .object({
        summary: z.string().trim().max(20000),
        privateNote: z.string().max(20000).default(''),
        homework: z
          .object({
            title: z.string().trim().min(1).max(250),
            description: z.string().max(20000),
            due: z.iso.datetime({ offset: true }),
          })
          .optional(),
      })
      .parse(req.body);
    const result = await db.transaction(async (tx) => {
      const s = (
        await tx.query('SELECT * FROM lesson_sessions WHERE id=$1 AND classroom_id=$2 FOR UPDATE', [
          id,
          room.id,
        ])
      ).rows[0];
      requireThat(s?.ended_at, 409, 'Сначала завершите занятие');
      const ids: string[] = s.homework_ids;
      if (input.homework && !ids.length)
        for (const student of await memberRows(ctx, room.id, tx)) {
          if (student.status !== 'active') continue;
          const hid = randomUUID(),
            data = recordSchemas.homework.parse({ ...input.homework, status: 'assigned' });
          await tx.query(
            `INSERT INTO records(id,kind,owner_id,student_id,data) VALUES($1,'homework',$2,$3,$4)`,
            [hid, room.owner_id, student.id, JSON.stringify(data)],
          );
          ids.push(hid);
        }
      return (
        await tx.query(
          'UPDATE lesson_sessions SET summary=$2,private_note=$3,homework_ids=$4 WHERE id=$1 RETURNING *',
          [id, input.summary, input.privateNote, JSON.stringify(ids)],
        )
      ).rows[0];
    });
    for (const hid of result.homework_ids) {
      const hw = (await db.query('SELECT * FROM records WHERE id=$1', [hid])).rows[0];
      const s = (await db.query('SELECT user_id FROM students WHERE id=$1', [hw.student_id]))
        .rows[0];
      await notify(
        ctx,
        room.owner_id,
        s.user_id,
        'Новое домашнее задание',
        hw.data.title,
        `/homework/${hid}`,
        `new-homework:${hid}`,
      );
    }
    io.to(`classroom:${room.id}`).emit('classroom-summary', { sessionId: id });
    return result;
  });
  app.get('/api/v1/classrooms/:id/messages', async (req) => {
    const room = await classroomAccess(db, req.user, idOf(req));
    return (
      await db.query(
        'SELECT * FROM (SELECT * FROM lesson_messages WHERE classroom_id=$1 ORDER BY created_at DESC LIMIT 150) m ORDER BY created_at',
        [room.id],
      )
    ).rows;
  });
  app.post('/api/v1/classrooms/:id/messages', async (req) => {
    const room = await classroomAccess(db, req.user, idOf(req));
    const input = z
      .object({
        id: z.uuid(),
        body: z.string().trim().min(1).max(2000),
        name: z.string().trim().min(1).max(100).optional(),
      })
      .parse(req.body);
    const inserted = (
      await db.query(
        'INSERT INTO lesson_messages(id,classroom_id,author_id,author_name,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING *',
        [input.id, room.id, req.user.id, input.name || req.user.name, input.body],
      )
    ).rows[0];
    const m =
      inserted || (await db.query('SELECT * FROM lesson_messages WHERE id=$1', [input.id])).rows[0];
    requireThat(m.classroom_id === room.id && m.author_id === req.user.id, 409);
    if (inserted) io.to(`classroom:${room.id}`).emit('classroom-message', m);
    return m;
  });
  app.post('/api/v1/classrooms/:id/link', async (req) => {
    const room = await classroomAccess(db, req.user, idOf(req));
    requireThat(room.owner_id === req.user.id);
    requireThat(
      room.kind === 'individual',
      400,
      'Используйте личные ссылки участников мини-группы',
    );
    const input = z
      .object({ rotate: z.boolean().default(false), revoke: z.boolean().default(false) })
      .parse(req.body);
    if (input.rotate)
      await db.transaction(async (tx) => {
        const old = (await tx.query('SELECT * FROM classrooms WHERE id=$1 FOR UPDATE', [room.id]))
          .rows[0];
        await tx.query('UPDATE invites SET revoked=true WHERE id=$1', [old.invite_id]);
        const raw = token(),
          id = randomUUID();
        await tx.query(
          `INSERT INTO invites(id,owner_id,board_id,token_hash,permission,expires_at,max_uses) VALUES($1,$2,$3,$4,'edit','9999-12-31T00:00:00Z',1000000000)`,
          [id, room.owner_id, room.board_id, hashToken(raw)],
        );
        await tx.query('UPDATE classrooms SET invite_id=$2,link_token=$3 WHERE id=$1', [
          room.id,
          id,
          raw,
        ]);
      });
    else if (input.revoke)
      await db.query('UPDATE invites SET revoked=true WHERE id=$1', [room.invite_id]);
    if (input.rotate || input.revoke)
      for (const s of io.sockets.sockets.values()) {
        const guest = (
          await db.query('SELECT invite_id FROM sessions WHERE token_hash=$1', [
            hashToken(s.data.session || ''),
          ])
        ).rows[0];
        if (guest?.invite_id === room.invite_id) {
          s.emit('access-revoked');
          s.disconnect(true);
        }
      }
    return roomDetails(ctx, await classroomAccess(db, req.user, room.id), req.user);
  });
  app.patch('/api/v1/classrooms/:id/members/:studentId', async (req) => {
    const room = await classroomAccess(db, req.user, idOf(req));
    requireThat(room.owner_id === req.user.id);
    const sid = z.uuid().parse((req.params as any).studentId),
      input = z.object({ permission: z.enum(['view', 'edit']) }).parse(req.body);
    const member = (
      await db.query(
        'SELECT s.* FROM students s JOIN classroom_members m ON m.student_id=s.id WHERE m.classroom_id=$1 AND s.id=$2',
        [room.id, sid],
      )
    ).rows[0];
    requireThat(member, 404, 'Ученик не участвует в этой комнате');
    await db.transaction(async (tx) => {
      await tx.query(
        'UPDATE classroom_members SET permission=$3 WHERE classroom_id=$1 AND student_id=$2',
        [room.id, sid, input.permission],
      );
      await tx.query(
        'UPDATE board_members SET permission=$3 WHERE board_id=$1 AND (user_id=$2 OR user_id IN(SELECT user_id FROM classroom_guests WHERE student_id=$4))',
        [room.board_id, member.user_id, input.permission, sid],
      );
    });
    io.to(`classroom:${room.id}`).emit('classroom-permission', {});
    return { ok: true };
  });
  io.on('connection', (socket) => {
    socket.on('join-classroom', async (payload, ack) => {
      try {
        await authenticate(db, socket.data.session);
        const input = z
          .object({
            roomId: z.uuid(),
            stage: z.enum(['lobby', 'lesson']),
            name: z.string().trim().min(1).max(100),
          })
          .parse(payload);
        const room = await classroomAccess(db, socket.data.user, input.roomId);
        const previous = socket.data.classroomId;
        for (const channel of socket.rooms)
          if (channel.startsWith('classroom:')) await socket.leave(channel);
        socket.data.classroomId = room.id;
        socket.data.classroomStage = input.stage;
        socket.data.classroomName = input.name;
        const member = (await memberRows(ctx, room.id)).find(
          (s) => s.user_id === socket.data.user.id,
        );
        socket.data.classroomStudentId =
          member?.id ||
          (socket.data.user.role === 'guest'
            ? (
                await db.query('SELECT student_id FROM classroom_guests WHERE user_id=$1', [
                  socket.data.user.id,
                ])
              ).rows[0]?.student_id
            : undefined);
        await socket.join(`classroom:${room.id}`);
        const live = await activeSession(ctx, room.id);
        if (live && input.stage === 'lesson')
          await db.query(
            'INSERT INTO lesson_attendance(session_id,user_id,name) VALUES($1,$2,$3) ON CONFLICT(session_id,user_id) DO UPDATE SET name=$3',
            [live.id, socket.data.user.id, input.name],
          );
        ack?.({ ok: true });
        if (previous && previous !== room.id) await broadcastClassroom(ctx, previous);
        await broadcastClassroom(ctx, room.id);
      } catch (e) {
        ack?.({ error: (e as Error).message });
      }
    });
    socket.on('classroom-hand', async (payload, ack) => {
      try {
        if (!socket.data.classroomId || typeof payload?.raised !== 'boolean') return;
        await authenticate(db, socket.data.session);
        await classroomAccess(db, socket.data.user, socket.data.classroomId);
        socket.data.handRaised = payload.raised;
        await broadcastClassroom(ctx, socket.data.classroomId);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: (e as Error).message });
      }
    });
    socket.on('disconnect', () => {
      if (socket.data.classroomId)
        void broadcastClassroom(ctx, socket.data.classroomId).catch(() => {});
    });
  });
}
