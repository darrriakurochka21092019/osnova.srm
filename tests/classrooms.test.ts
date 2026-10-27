import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../apps/api/src/app';
import { openDatabase, type Database } from '../apps/api/src/db';

let ctx: Awaited<ReturnType<typeof createApp>>,
  dir: string,
  teacher = '',
  a: any,
  b: any,
  c: any,
  ca = '',
  cb = '',
  cc = '',
  room: any,
  session: any,
  lesson: any,
  group: any,
  guest = '';
let adminDb: Database | undefined, schema: string | undefined;
async function api(method: string, url: string, body?: any, cookie = teacher) {
  const r = await ctx.app.inject({
    method: method as any,
    url: `/api/v1${url}`,
    payload: body,
    headers: { origin: 'http://localhost:5173', ...(cookie ? { cookie } : {}) },
  });
  return {
    status: r.statusCode,
    body: r.json(),
    cookie: String(r.headers['set-cookie'] || '').split(';')[0],
  };
}
const ok = (r: any) => {
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const tokenOf = (r: any) => new URL(r.link).hash.slice(1);
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'osnova-classrooms-'));
  const testUrl = process.env.OSNOVA_TEST_DATABASE_URL;
  let database: Database | undefined;
  if (testUrl) {
    const url = new URL(testUrl);
    assert.match(url.pathname, /^\/osnova_test/, 'Tests must use a dedicated osnova_test database');
    adminDb = await openDatabase(testUrl);
    schema = `classrooms_${randomUUID().replaceAll('-', '')}`;
    await adminDb.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-csearch_path=${schema}`);
    database = await openDatabase(url.toString());
  }
  ctx = await createApp({ dataDir: dir, logger: false, reminders: false }, database);
  await ctx.app.ready();
  teacher = (
    await api(
      'POST',
      '/auth/setup',
      { name: 'Тест уроков', email: 'lessons@example.test', password: 'lessons-password-test' },
      '',
    )
  ).cookie;
  const members = [];
  for (const name of ['Саша', 'Миша', 'Таня']) {
    const student = ok(
      await api('POST', '/students', { name, grade: '9 класс', subject: 'Математика' }),
    );
    const invite = ok(await api('POST', `/students/${student.id}/invite`, {}));
    const login = await api(
      'POST',
      '/invites/redeem',
      {
        token: new URL(invite.url).hash.slice(1),
        name,
        email: `${student.id}@example.test`,
        password: 'student-password-test',
      },
      '',
    );
    assert.equal(login.status, 200);
    members.push({ student, cookie: login.cookie });
  }
  [{ student: a, cookie: ca }, { student: b, cookie: cb }, { student: c, cookie: cc }] = members;
});
after(async () => {
  await ctx?.app.close();
  if (adminDb) {
    if (schema) await adminDb.query(`DROP SCHEMA ${schema} CASCADE`);
    await adminDb.close();
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});

test('a student automatically receives a private persistent classroom, canvas and reusable link', async () => {
  room = ok(await api('GET', `/classrooms/${a.classroom_id}`));
  assert.equal(room.students[0].id, a.id);
  assert.equal(room.students[0].subject, 'Математика');
  assert.equal(ok(await api('GET', `/classrooms/${room.id}`)).link, room.link);
  const board = ok(await api('GET', `/boards/${room.board_id}`, undefined, ca));
  assert.ok(board.canvas_page_id);
  assert.equal(board.background, 'dots');
  assert.equal((await api('GET', `/classrooms/${room.id}`, undefined, cb)).status, 404);
  assert.equal((await api('GET', `/boards/${room.board_id}`, undefined, cb)).status, 404);
  assert.equal(ok(await api('GET', `/classrooms/${room.id}`, undefined, ca)).link, undefined);
  const ensured = ok(await api('POST', '/classrooms', { studentIds: [a.id] }));
  assert.equal(ensured.id, room.id);
  assert.equal(ok(await api('GET', '/classrooms', undefined, ca)).length, 1);
});

test('scheduled lessons reuse the classroom; waiting, starting, ending and milestones follow the lesson lifecycle', async () => {
  lesson = ok(
    await api('POST', '/records/lesson', {
      studentId: a.id,
      data: {
        title: 'Квадратные уравнения',
        start: new Date(Date.now() + 60000).toISOString(),
        duration: 60,
        price: 1500,
        status: 'planned',
        subject: 'Математика',
      },
    }),
  );
  assert.equal(lesson.data.classroomId, room.id);
  assert.equal(lesson.data.boardId, room.board_id);
  const second = ok(
    await api('POST', '/records/lesson', {
      studentId: a.id,
      data: {
        title: 'Следующий урок',
        start: new Date(Date.now() + 7 * 86400000).toISOString(),
        duration: 60,
        price: 1500,
        status: 'planned',
      },
    }),
  );
  assert.equal(second.data.boardId, room.board_id);
  assert.equal(
    ok(await api('POST', `/classrooms/${room.id}/join`, { lessonId: lesson.id, name: 'Саша' }, ca))
      .waiting,
    true,
  );
  session = ok(
    await api('POST', `/classrooms/${room.id}/join`, {
      lessonId: lesson.id,
      name: 'Преподаватель',
    }),
  ).session;
  assert.ok(session.id);
  assert.equal(
    ok(
      await api('POST', `/classrooms/${room.id}/join`, {
        lessonId: lesson.id,
        name: 'Преподаватель',
      }),
    ).session.id,
    session.id,
  );
  assert.equal(
    (await api('POST', `/classrooms/${b.classroom_id}/join`, { name: 'Преподаватель' })).status,
    409,
  );
  assert.equal(
    (await api('PATCH', `/records/lesson/${lesson.id}`, { data: { status: 'cancelled' } })).status,
    409,
  );
  assert.equal(
    (await api('POST', `/classrooms/${room.id}/sessions/${session.id}/end`, {}, ca)).status,
    403,
  );
  const ended = ok(await api('POST', `/classrooms/${room.id}/sessions/${session.id}/end`, {}));
  assert.ok(ended.ended_at);
  assert.equal(
    ok(await api('POST', `/classrooms/${room.id}/sessions/${session.id}/end`, {})).ended_at,
    ended.ended_at,
  );
  const board = ok(await api('GET', `/boards/${room.board_id}`));
  const history = ok(await api('GET', `/pages/${board.canvas_page_id}/history`));
  assert.deepEqual(
    history
      .filter((s: any) => s.lesson_session_id === session.id)
      .map((s: any) => s.label)
      .sort(),
    ['Завершение урока', 'Перед уроком'],
  );
  assert.equal(
    ok(await api('GET', '/records/lesson')).find((r: any) => r.id === lesson.id).data.status,
    'completed',
  );
  assert.equal(
    (await api('PATCH', `/records/lesson/${lesson.id}`, { data: { status: 'planned' } })).status,
    409,
  );
  assert.equal(
    (await api('PATCH', `/records/lesson/${lesson.id}`, { data: { studentIds: [b.id] } })).status,
    409,
  );
  assert.equal((await api('DELETE', `/records/lesson/${lesson.id}`)).status, 409);
  assert.equal(
    (await api('GET', `/pages/${board.canvas_page_id}/history/${history[0].id}`, undefined, ca))
      .status,
    403,
  );
});

test('room comments are isolated and retry safely; edit permissions apply to the actual shared canvas', async () => {
  const id = randomUUID(),
    msg = { id, body: 'Почему здесь два корня?' };
  const m = ok(await api('POST', `/classrooms/${room.id}/messages`, msg, ca));
  assert.equal(m.author_id, a.user_id);
  assert.equal(ok(await api('POST', `/classrooms/${room.id}/messages`, msg, ca)).id, id);
  assert.equal(ok(await api('GET', `/classrooms/${room.id}/messages`, undefined, ca)).length, 1);
  assert.equal((await api('GET', `/classrooms/${room.id}/messages`, undefined, cb)).status, 404);
  ok(await api('PATCH', `/classrooms/${room.id}/members/${a.id}`, { permission: 'view' }));
  assert.equal(ok(await api('GET', `/classrooms/${room.id}`, undefined, ca)).permission, 'view');
  const board = ok(await api('GET', `/boards/${room.board_id}`));
  assert.equal(
    (
      await api(
        'POST',
        `/pages/${board.canvas_page_id}/operations`,
        {
          operationId: randomUUID(),
          changes: [
            {
              baseVersion: null,
              element: {
                id: 'view-ink',
                type: 'freedraw',
                version: 1,
                versionNonce: 1,
                x: 0,
                y: 0,
                width: 10,
                height: 10,
              },
            },
          ],
        },
        ca,
      )
    ).status,
    403,
  );
  ok(await api('PATCH', `/classrooms/${room.id}/members/${a.id}`, { permission: 'edit' }));
});

test('one permanent entry link grants only the student classroom; rotation invalidates the old link and sessions', async () => {
  const raw = tokenOf(room);
  const preview = ok(await api('POST', '/classrooms/preview', { roomId: room.id, token: raw }, ''));
  assert.equal(preview.link, undefined);
  assert.equal(preview.lesson?.data.price, undefined);
  const redeemed = await api(
    'POST',
    '/classrooms/redeem',
    { roomId: room.id, token: raw, name: 'Саша' },
    '',
  );
  ok(redeemed);
  guest = redeemed.cookie;
  assert.equal(
    ok(await api('GET', `/classrooms/${room.id}`, undefined, guest)).board_id,
    room.board_id,
  );
  assert.equal((await api('GET', `/classrooms/${b.classroom_id}`, undefined, guest)).status, 404);
  assert.deepEqual(ok(await api('GET', '/students', undefined, guest)), []);
  room = ok(await api('POST', `/classrooms/${room.id}/link`, { rotate: true }));
  assert.notEqual(tokenOf(room), raw);
  assert.equal(
    (await api('POST', '/classrooms/preview', { roomId: room.id, token: raw }, '')).status,
    410,
  );
  assert.equal((await api('GET', `/classrooms/${room.id}`, undefined, guest)).status, 401);
});

test('individual entry links lead group members to the same scheduled room; summaries and homework stay scoped', async () => {
  const scheduled = ok(
    await api('POST', '/records/lesson', {
      studentId: a.id,
      data: {
        title: 'Мини-группа: уравнения',
        start: new Date(Date.now() + 120000).toISOString(),
        duration: 60,
        price: 900,
        status: 'planned',
        studentIds: [b.id],
      },
    }),
  );
  group = ok(await api('POST', `/lessons/${scheduled.id}/classroom`, {}));
  assert.equal(group.kind, 'group');
  assert.deepEqual(group.students.map((s: any) => s.id).sort(), [a.id, b.id].sort());
  const br = ok(await api('GET', `/classrooms/${b.classroom_id}`));
  for (const link of [room, br])
    assert.equal(
      ok(await api('POST', '/classrooms/preview', { roomId: link.id, token: tokenOf(link) }, ''))
        .id,
      group.id,
    );
  const redemption = await api(
    'POST',
    '/classrooms/redeem',
    { roomId: room.id, token: tokenOf(room), name: 'Саша' },
    '',
  );
  ok(redemption);
  guest = redemption.cookie;
  assert.equal(
    ok(await api('GET', `/classrooms/${group.id}`, undefined, guest)).board_id,
    group.board_id,
  );
  assert.equal((await api('GET', `/classrooms/${group.id}`, undefined, cc)).status, 404);
  const started = ok(
    await api('POST', `/classrooms/${group.id}/join`, {
      lessonId: scheduled.id,
      name: 'Преподаватель',
    }),
  ).session;
  for (const cookie of [ca, cb, guest])
    assert.equal(
      ok(
        await api(
          'POST',
          `/classrooms/${group.id}/join`,
          { lessonId: scheduled.id, name: 'Участник' },
          cookie,
        ),
      ).session.id,
      started.id,
    );
  ok(await api('POST', `/classrooms/${group.id}/sessions/${started.id}/end`, {}));
  const summary = {
    summary: 'Решили квадратные уравнения. Проверили корни.',
    privateNote: 'Повторить дискриминант в начале.',
    homework: {
      title: 'Закрепить уравнения',
      description: 'Решить три уравнения.',
      due: new Date(Date.now() + 86400000).toISOString(),
    },
  };
  const saved = ok(
    await api('PATCH', `/classrooms/${group.id}/sessions/${started.id}/summary`, summary),
  );
  assert.equal(saved.homework_ids.length, 2);
  assert.deepEqual(
    ok(await api('PATCH', `/classrooms/${group.id}/sessions/${started.id}/summary`, summary))
      .homework_ids,
    saved.homework_ids,
  );
  const visible = ok(
    await api('GET', `/classrooms/${group.id}/sessions/${started.id}`, undefined, ca),
  );
  assert.equal(visible.session.private_note, undefined);
  assert.equal(visible.session.summary, summary.summary);
  assert.equal(
    ok(await api('GET', '/records/homework', undefined, ca)).filter((r: any) =>
      saved.homework_ids.includes(r.id),
    ).length,
    1,
  );
  assert.equal(ok(await api('GET', '/records/homework', undefined, cc)).length, 0);
});

test('changing an individual lesson to a mini-group never grants access to the former private board', async () => {
  const personal = ok(await api('GET', `/classrooms/${c.classroom_id}`));
  const planned = ok(
    await api('POST', '/records/lesson', {
      studentId: c.id,
      data: {
        title: 'Переход к мини-группе',
        start: new Date(Date.now() + 86400000).toISOString(),
        duration: 60,
        price: 0,
        status: 'planned',
      },
    }),
  );
  assert.equal(planned.data.boardId, personal.board_id);
  const changed = ok(
    await api('PATCH', `/records/lesson/${planned.id}`, { data: { studentIds: [a.id] } }),
  );
  assert.notEqual(changed.data.boardId, personal.board_id);
  assert.equal((await api('GET', `/boards/${personal.board_id}`, undefined, ca)).status, 404);
  assert.equal((await api('GET', `/boards/${changed.data.boardId}`, undefined, ca)).status, 200);
  assert.equal(
    (
      await api('POST', '/records/lesson', {
        studentId: c.id,
        data: { ...planned.data, status: 'live' },
      })
    ).status,
    400,
  );
});

test('end-of-lesson materials keep their scene and background after later edits and remain private', async () => {
  const personal = ok(await api('GET', `/classrooms/${c.classroom_id}`));
  const board = ok(await api('GET', `/boards/${personal.board_id}`));
  const element = {
    id: 'lesson-material',
    type: 'rectangle',
    version: 1,
    versionNonce: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    isDeleted: false,
  };
  ok(
    await api('POST', `/pages/${board.canvas_page_id}/operations`, {
      operationId: randomUUID(),
      changes: [{ baseVersion: null, element }],
    }),
  );
  ok(await api('PATCH', `/boards/${board.id}`, { background: 'grid' }));
  const started = ok(
    await api('POST', `/classrooms/${personal.id}/join`, { name: 'Преподаватель' }),
  ).session;
  assert.equal(
    (await api('GET', `/classrooms/${personal.id}/sessions/${started.id}/materials`, undefined, cc))
      .status,
    404,
  );
  ok(await api('POST', `/classrooms/${personal.id}/sessions/${started.id}/end`, {}));
  ok(
    await api('POST', `/pages/${board.canvas_page_id}/operations`, {
      operationId: randomUUID(),
      changes: [
        { baseVersion: 1, element: { ...element, version: 2, versionNonce: 2, width: 250 } },
      ],
    }),
  );
  ok(await api('PATCH', `/boards/${board.id}`, { background: 'white' }));
  const material = ok(
    await api('GET', `/classrooms/${personal.id}/sessions/${started.id}/materials`, undefined, cc),
  );
  assert.equal(material.scene.find((e: any) => e.id === element.id).width, 100);
  assert.equal(material.background, 'grid');
  assert.equal(
    (await api('GET', `/classrooms/${personal.id}/sessions/${started.id}/materials`, undefined, ca))
      .status,
    404,
  );
});

test('a lesson opened from the schedule keeps its own summary even after thirty newer sessions', async () => {
  await ctx.db.transaction(async (tx) => {
    for (let i = 0; i < 31; i++) {
      const rid = randomUUID(),
        sid = randomUUID(),
        date = new Date(new Date(session.started_at).getTime() + (i + 1) * 86400000).toISOString();
      await tx.query(
        `INSERT INTO records(id,kind,owner_id,student_id,data) VALUES($1,'lesson',$2,$3,$4)`,
        [
          rid,
          room.owner_id,
          a.id,
          JSON.stringify({
            ...lesson.data,
            title: `История ${i + 1}`,
            status: 'completed',
            start: date,
          }),
        ],
      );
      await tx.query(
        'INSERT INTO lesson_sessions(id,classroom_id,lesson_id,started_at,ended_at) VALUES($1,$2,$3,$4,$4)',
        [sid, room.id, rid, date],
      );
    }
  });
  const latest = ok(await api('GET', `/classrooms/${room.id}`));
  assert.equal(latest.sessions.length, 30);
  assert.equal(
    latest.sessions.some((s: any) => s.id === session.id),
    false,
  );
  const selected = ok(await api('POST', `/lessons/${lesson.id}/classroom`, {}));
  assert.ok(selected.sessions.find((s: any) => s.id === session.id && s.ended_at));
});

test('pausing a student blocks both their account and room-link guest sessions', async () => {
  ok(await api('PATCH', `/students/${a.id}`, { status: 'paused' }));
  assert.equal((await api('GET', `/classrooms/${room.id}`, undefined, ca)).status, 401);
  assert.equal((await api('GET', `/classrooms/${group.id}`, undefined, guest)).status, 401);
  assert.equal(
    (await api('POST', '/classrooms/preview', { roomId: room.id, token: tokenOf(room) }, ''))
      .status,
    410,
  );
});
