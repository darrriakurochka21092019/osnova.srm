import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  kinds,
  recordSchemas,
  studentSchema,
  type Entry,
  type User,
  type RecordKind,
} from '../../../../packages/contracts';
import type { Context } from '../app';
import type { Queryable } from '../db';
import { requireThat, studentAccess, hashToken, token, boardAccess } from '../security';

export async function canReadRecord(db: Queryable, user: User, record: Entry) {
  if (record.kind === 'notification') return record.data.recipientId === user.id;
  if (user.role === 'teacher') return record.owner_id === user.id;
  if (user.role !== 'student' || record.owner_id !== user.owner_id) return false;
  const student = (await db.query('SELECT id FROM students WHERE user_id=$1', [user.id])).rows[0];
  if (!student) return false;
  if (['task', 'note', 'transaction', 'document'].includes(record.kind)) return false;
  if (record.kind === 'material')
    return (
      !!record.data.shared &&
      (!record.data.studentIds?.length || record.data.studentIds.includes(student.id))
    );
  if (record.kind === 'report' && !record.data.shared) return false;
  return record.student_id === student.id || record.data.studentIds?.includes(student.id);
}
export async function notify(
  ctx: Context,
  ownerId: string,
  recipientId: string,
  title: string,
  message: string,
  path: string,
  dedupeKey?: string,
) {
  const data = {
    title,
    message,
    path,
    recipientId,
    read: false,
    ...(dedupeKey ? { dedupeKey } : {}),
  };
  const rows = (
    await ctx.db.query(
      "INSERT INTO records(id,kind,owner_id,data) VALUES($1,'notification',$2,$3) ON CONFLICT DO NOTHING RETURNING *",
      [randomUUID(), ownerId, JSON.stringify(data)],
    )
  ).rows;
  if (rows.length) ctx.io.to(`user:${recipientId}`).emit('notification', rows[0]);
}
async function recipient(db: Queryable, studentId?: string | null) {
  return studentId
    ? (await db.query('SELECT user_id FROM students WHERE id=$1', [studentId])).rows[0]?.user_id
    : null;
}
export async function validateFileRefs(db: Queryable, user: User, ids: string[]) {
  for (const id of ids) {
    const file = (
      await db.query(
        'SELECT f.*,u.owner_id AS user_owner FROM files f JOIN users u ON u.id=f.owner_id WHERE f.id=$1',
        [id],
      )
    ).rows[0];
    requireThat(
      file &&
        (file.owner_id === user.id || (user.role === 'teacher' && file.user_owner === user.id)),
      403,
      'Файл недоступен для прикрепления',
    );
  }
}
export async function recordRoutes(ctx: Context) {
  const { app, db, config, io } = ctx;
  app.get('/api/v1/students', async (req) => {
    if (req.user.role === 'guest') return [];
    return (
      await db.query(
        'SELECT * FROM students WHERE owner_id=$1 AND ($2::boolean OR user_id=$3) ORDER BY created_at',
        [
          req.user.role === 'teacher' ? req.user.id : req.user.owner_id,
          req.user.role === 'teacher',
          req.user.id,
        ],
      )
    ).rows;
  });
  app.post('/api/v1/students', async (req) => {
    requireThat(req.user.role === 'teacher');
    const input = studentSchema.parse(req.body);
    const id = randomUUID(),
      uid = randomUUID();
    return db.transaction(async (tx) => {
      await tx.query("INSERT INTO users(id,owner_id,role,name) VALUES($1,$2,'student',$3)", [
        uid,
        req.user.id,
        input.name,
      ]);
      return (
        await tx.query(
          'INSERT INTO students(id,owner_id,user_id,name,grade,goal,program,status,color) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          [
            id,
            req.user.id,
            uid,
            input.name,
            input.grade,
            input.goal,
            input.program,
            input.status,
            input.color,
          ],
        )
      ).rows[0];
    });
  });
  app.patch('/api/v1/students/:id', async (req) => {
    requireThat(req.user.role === 'teacher');
    const id = z.uuid().parse((req.params as any).id);
    await studentAccess(db, req.user.id, id);
    const current = (await db.query('SELECT * FROM students WHERE id=$1', [id])).rows[0];
    const input = studentSchema.parse({
      ...current,
      ...z.record(z.string(), z.unknown()).parse(req.body),
    });
    const row = await db.transaction(async (tx) => {
      await tx.query('UPDATE users SET active=$2 WHERE id=$1', [
        current.user_id,
        input.status === 'active',
      ]);
      return (
        await tx.query(
          'UPDATE students SET name=$2,grade=$3,goal=$4,program=$5,status=$6,color=$7 WHERE id=$1 RETURNING *',
          [id, input.name, input.grade, input.goal, input.program, input.status, input.color],
        )
      ).rows[0];
    });
    if (input.status === 'paused') io.in(`user:${current.user_id}`).disconnectSockets();
    return row;
  });
  app.post('/api/v1/students/:id/invite', async (req) => {
    requireThat(req.user.role === 'teacher');
    const id = z.uuid().parse((req.params as any).id);
    await studentAccess(db, req.user.id, id);
    const raw = token(),
      inviteId = randomUUID();
    await db.query(
      "UPDATE invites SET revoked=true WHERE student_id=$1 AND permission='account' AND revoked=false",
      [id],
    );
    await db.query(
      "INSERT INTO invites(id,owner_id,student_id,token_hash,permission,expires_at) VALUES($1,$2,$3,$4,'account',$5)",
      [
        inviteId,
        req.user.id,
        id,
        hashToken(raw),
        new Date(Date.now() + 7 * 86400000).toISOString(),
      ],
    );
    return { id: inviteId, url: `${config.origin}/join#${raw}` };
  });
  app.get('/api/v1/records/:kind', async (req) => {
    const kind = z.enum(kinds as [RecordKind, ...RecordKind[]]).parse((req.params as any).kind);
    const owner = req.user.role === 'teacher' ? req.user.id : req.user.owner_id;
    if (req.user.role === 'guest') return [];
    const rows = (
      await db.query(
        'SELECT * FROM records WHERE owner_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 5000',
        [owner, kind],
      )
    ).rows;
    const flags = await Promise.all(rows.map((r) => canReadRecord(db, req.user, r)));
    return rows.filter((_, i) => flags[i]);
  });
  app.post('/api/v1/records/:kind', async (req) => {
    requireThat(req.user.role === 'teacher');
    const kind = z.enum(kinds as [RecordKind, ...RecordKind[]]).parse((req.params as any).kind);
    const input = z
      .object({
        studentId: z.uuid().nullable().optional(),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(req.body);
    await studentAccess(db, req.user.id, input.studentId);
    const data = recordSchemas[kind].parse(input.data) as any;
    if (
      ['homework', 'result', 'report'].includes(kind) ||
      (kind === 'transaction' && data.type === 'payment')
    )
      requireThat(input.studentId, 400, 'Выберите ученика');
    if (kind === 'result' || kind === 'homework')
      requireThat(
        data.score === null || data.score <= data.maxScore,
        400,
        'Баллы превышают максимум',
      );
    if (data.studentIds)
      for (const sid of data.studentIds) await studentAccess(db, req.user.id, sid);
    await validateFileRefs(db, req.user, [...(data.fileIds || []), ...(data.answerFileIds || [])]);
    if (kind === 'lesson' && data.boardId) {
      const b = await boardAccess(db, req.user, data.boardId);
      requireThat(b.owner_id === req.user.id);
      for (const sid of new Set([input.studentId, ...data.studentIds].filter(Boolean))) {
        await db.query(
          "INSERT INTO board_members(board_id,user_id,permission) SELECT $1,user_id,'edit' FROM students WHERE id=$2 ON CONFLICT DO NOTHING",
          [data.boardId, sid],
        );
      }
    }
    if (kind === 'notification') {
      const u = (
        await db.query('SELECT id FROM users WHERE id=$1 AND (id=$2 OR owner_id=$2)', [
          data.recipientId,
          req.user.id,
        ])
      ).rows[0];
      requireThat(u, 403, 'Получатель недоступен');
    }
    const record = (
      await db.query(
        'INSERT INTO records(id,kind,owner_id,student_id,data) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [randomUUID(), kind, req.user.id, input.studentId || null, JSON.stringify(data)],
      )
    ).rows[0];
    const uid = await recipient(db, input.studentId);
    if (kind === 'notification') io.to(`user:${data.recipientId}`).emit('notification', record);
    if (kind === 'homework' && uid)
      await notify(
        ctx,
        req.user.id,
        uid,
        'Новое домашнее задание',
        data.title,
        `/homework/${record.id}`,
        `new-homework:${record.id}`,
      );
    if (kind === 'lesson') {
      for (const sid of new Set([input.studentId, ...data.studentIds].filter(Boolean))) {
        const uid = await recipient(db, sid as string);
        if (uid)
          await notify(
            ctx,
            req.user.id,
            uid,
            'Запланирован урок',
            data.title,
            '/schedule',
            `new-lesson:${record.id}:${uid}`,
          );
      }
    }
    if (kind === 'material' && data.shared) {
      const all = data.studentIds.length
        ? data.studentIds
        : (
            await db.query("SELECT id FROM students WHERE owner_id=$1 AND status='active'", [
              req.user.id,
            ])
          ).rows.map((s) => s.id);
      for (const sid of all) {
        const uid = await recipient(db, sid);
        if (uid)
          await notify(
            ctx,
            req.user.id,
            uid,
            'Новый учебный материал',
            data.title,
            '/materials',
            `new-material:${record.id}:${uid}`,
          );
      }
    }
    return record;
  });
  app.patch('/api/v1/records/:kind/:id', async (req) => {
    const id = z.uuid().parse((req.params as any).id),
      kind = z.enum(kinds as [RecordKind, ...RecordKind[]]).parse((req.params as any).kind);
    const record = (await db.query('SELECT * FROM records WHERE id=$1 AND kind=$2', [id, kind]))
      .rows[0];
    requireThat(record && (await canReadRecord(db, req.user, record)), 404, 'Запись не найдена');
    const input = z
      .object({
        studentId: z.uuid().nullable().optional(),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(req.body);
    let patch = input.data;
    if (req.user.role !== 'teacher') {
      requireThat(input.studentId === undefined, 403);
      if (kind === 'homework') {
        requireThat(record.data.status !== 'reviewed', 409, 'Работа уже проверена');
        patch = z
          .object({
            answer: z.string().max(20000).optional(),
            answerFileIds: z.array(z.uuid()).max(30).optional(),
            status: z.enum(['draft', 'submitted']).optional(),
          })
          .strict()
          .parse(patch);
        await validateFileRefs(db, req.user, (patch.answerFileIds || []) as string[]);
      } else if (kind === 'notification')
        patch = z.object({ read: z.boolean() }).strict().parse(patch);
      else if (kind === 'lesson')
        patch = z
          .object({ rescheduleRequest: z.string().trim().min(1).max(1000) })
          .strict()
          .parse(patch);
      else requireThat(false);
    } else {
      await studentAccess(db, req.user.id, input.studentId);
      if (patch.studentIds)
        for (const sid of patch.studentIds as string[]) await studentAccess(db, req.user.id, sid);
      await validateFileRefs(db, req.user, [
        ...((patch.fileIds || []) as string[]),
        ...((patch.answerFileIds || []) as string[]),
      ]);
      if (patch.boardId) {
        const b = await boardAccess(db, req.user, patch.boardId as string);
        requireThat(b.owner_id === req.user.id);
      }
    }
    const data = recordSchemas[kind].parse({ ...record.data, ...patch }) as any;
    if (kind === 'notification')
      requireThat(
        data.recipientId === record.data.recipientId,
        403,
        'Получатель уведомления не меняется',
      );
    if (kind === 'result' || kind === 'homework')
      requireThat(
        data.score === null || data.score <= data.maxScore,
        400,
        'Баллы превышают максимум',
      );
    if (kind === 'lesson' && data.boardId && req.user.role === 'teacher') {
      const b = await boardAccess(db, req.user, data.boardId);
      requireThat(b.owner_id === req.user.id);
      for (const sid of new Set(
        [
          input.studentId === undefined ? record.student_id : input.studentId,
          ...data.studentIds,
        ].filter(Boolean),
      )) {
        await db.query(
          "INSERT INTO board_members(board_id,user_id,permission) SELECT $1,user_id,'edit' FROM students WHERE id=$2 AND owner_id=$3 ON CONFLICT DO NOTHING",
          [data.boardId, sid, req.user.id],
        );
      }
    }
    const updated = (
      await db.query(
        'UPDATE records SET data=$2,student_id=$3,updated_at=now() WHERE id=$1 RETURNING *',
        [
          id,
          JSON.stringify(data),
          input.studentId === undefined ? record.student_id : input.studentId,
        ],
      )
    ).rows[0];
    const uid = await recipient(db, updated.student_id);
    if (kind === 'homework' && data.status === 'submitted' && record.data.status !== 'submitted')
      await notify(
        ctx,
        record.owner_id,
        record.owner_id,
        'Работа ждёт проверки',
        data.title,
        `/homework/${id}`,
        `submitted:${id}:${updated.updated_at}`,
      );
    if (kind === 'homework' && data.status === 'reviewed' && uid)
      await notify(
        ctx,
        record.owner_id,
        uid,
        'Работа проверена',
        data.title,
        `/homework/${id}`,
        `reviewed:${id}:${updated.updated_at}`,
      );
    if (kind === 'lesson') {
      if (req.user.role === 'student')
        await notify(
          ctx,
          record.owner_id,
          record.owner_id,
          'Запрос на перенос',
          `${req.user.name}: ${data.rescheduleRequest}`,
          '/schedule',
          `reschedule:${id}:${updated.updated_at}`,
        );
      else
        for (const sid of new Set([updated.student_id, ...data.studentIds].filter(Boolean))) {
          const target = await recipient(db, sid as string);
          if (target)
            await notify(
              ctx,
              record.owner_id,
              target,
              data.status === 'cancelled' ? 'Урок отменён' : 'Расписание изменилось',
              data.title,
              '/schedule',
              `changed:${id}:${updated.updated_at}:${target}`,
            );
        }
    }
    return updated;
  });
  app.delete('/api/v1/records/:kind/:id', async (req) => {
    requireThat(req.user.role === 'teacher');
    const id = z.uuid().parse((req.params as any).id),
      kind = z.enum(kinds as [RecordKind, ...RecordKind[]]).parse((req.params as any).kind);
    const r = await db.query(
      'DELETE FROM records WHERE id=$1 AND kind=$2 AND owner_id=$3 RETURNING id',
      [id, kind, req.user.id],
    );
    requireThat(r.rows[0], 404, 'Запись не найдена');
    return { ok: true };
  });
  app.get('/api/v1/audit', async (req) => {
    requireThat(req.user.role === 'teacher');
    return (
      await db.query(
        'SELECT a.action,a.target_id,a.created_at,u.name FROM audit_events a JOIN users u ON u.id=a.user_id WHERE u.id=$1 OR u.owner_id=$1 ORDER BY a.created_at DESC LIMIT 100',
        [req.user.id],
      )
    ).rows;
  });
}

export async function tickNotifications(ctx: Context) {
  const teachers = (await ctx.db.query("SELECT id FROM users WHERE role='teacher' AND active=true"))
    .rows;
  for (const teacher of teachers) {
    const records = (
      await ctx.db.query(
        "SELECT * FROM records WHERE owner_id=$1 AND kind IN ('lesson','homework','transaction','task')",
        [teacher.id],
      )
    ).rows as Entry[];
    for (const record of records) {
      const d = record.data;
      if (record.kind === 'lesson' && ['planned', 'rescheduled'].includes(d.status)) {
        const targets = new Set<string>([teacher.id]);
        for (const sid of new Set([record.student_id, ...(d.studentIds || [])].filter(Boolean))) {
          const uid = await recipient(ctx.db, sid as string);
          if (uid) targets.add(uid);
        }
        for (const uid of targets) {
          const u = (
            await ctx.db.query('SELECT settings FROM users WHERE id=$1 AND active=true', [uid])
          ).rows[0];
          if (!u || u.settings.reminders === false) continue;
          const settings = u.settings;
          const mins = Number(settings.reminderMinutes || 30),
            delta = new Date(d.start).getTime() - Date.now();
          const time = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Moscow',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date());
          const a = settings.quietStart || '22:00',
            b = settings.quietEnd || '08:00';
          const quiet = a === b ? false : a > b ? time >= a || time < b : time >= a && time < b;
          if (delta > 0 && delta <= mins * 60000 && !quiet)
            await notify(
              ctx,
              teacher.id,
              uid,
              'Скоро урок',
              d.title,
              '/schedule',
              `reminder:${record.id}:${d.start}:${uid}`,
            );
        }
      }
      if (
        record.kind === 'homework' &&
        ['assigned', 'draft'].includes(d.status) &&
        new Date(d.due).getTime() < Date.now()
      ) {
        await notify(
          ctx,
          teacher.id,
          teacher.id,
          'Истёк срок задания',
          d.title,
          `/homework/${record.id}`,
          `overdue:${record.id}`,
        );
        const uid = await recipient(ctx.db, record.student_id);
        if (uid)
          await notify(
            ctx,
            teacher.id,
            uid,
            'Пора сдать работу',
            d.title,
            `/homework/${record.id}`,
            `overdue-student:${record.id}`,
          );
      }
      if (
        record.kind === 'homework' &&
        ['assigned', 'draft'].includes(d.status) &&
        new Date(d.due).getTime() > Date.now() &&
        new Date(d.due).getTime() - Date.now() <= 86400000
      ) {
        const uid = await recipient(ctx.db, record.student_id);
        if (uid)
          await notify(
            ctx,
            teacher.id,
            uid,
            'Скоро срок сдачи',
            d.title,
            `/homework/${record.id}`,
            `due-soon:${record.id}`,
          );
      }
    }
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const students = (
      await ctx.db.query('SELECT id,name FROM students WHERE owner_id=$1', [teacher.id])
    ).rows;
    for (const s of students) {
      const paid = records
        .filter(
          (r) => r.kind === 'transaction' && r.student_id === s.id && r.data.type === 'payment',
        )
        .reduce((n, r) => n + r.data.amount, 0);
      const charged = records
        .filter(
          (r) =>
            r.kind === 'lesson' &&
            r.data.status === 'completed' &&
            (r.student_id === s.id || r.data.studentIds?.includes(s.id)),
        )
        .reduce((n, r) => n + r.data.price, 0);
      if (charged > paid)
        await notify(
          ctx,
          teacher.id,
          teacher.id,
          'Есть неоплаченные занятия',
          `${s.name}: к оплате ${charged - paid} ₽`,
          '/finances',
          `payment-due:${s.id}:${today}`,
        );
    }
    for (const r of records.filter(
      (r) =>
        r.kind === 'task' &&
        !r.data.done &&
        r.data.due &&
        new Date(r.data.due).getTime() < Date.now(),
    ))
      await notify(
        ctx,
        teacher.id,
        teacher.id,
        'Проверьте рабочую задачу',
        r.data.title,
        '/tasks',
        `task-due:${r.id}:${today}`,
      );
    if (today.endsWith('-01'))
      await notify(
        ctx,
        teacher.id,
        teacher.id,
        'Время ежемесячных отчётов',
        'Подведите итоги прошлого месяца и запланируйте следующие шаги.',
        '/reports',
        `reports:${today}`,
      );
  }
}
