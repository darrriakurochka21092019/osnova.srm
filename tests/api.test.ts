import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../apps/api/src/app';
import { openDatabase } from '../apps/api/src/db';
import { tickNotifications } from '../apps/api/src/modules/records';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

let ctx: Awaited<ReturnType<typeof createApp>>,
  teacherCookie = '',
  studentCookie = '',
  otherStudentCookie = '',
  guestCookie = '',
  viewCookie = '';
let student: any, student2: any, board: any, page: any, invite: any;
let dataDir: string;
const origin = 'http://localhost:5173';
async function request(method: string, url: string, payload?: any, cookie = teacherCookie) {
  const r = await ctx.app.inject({
    method: method as any,
    url: `/api/v1${url}`,
    headers: { origin, ...(cookie ? { cookie } : {}) },
    payload,
  });
  return {
    status: r.statusCode,
    body: r.json(),
    cookie: String(r.headers['set-cookie'] || '').split(';')[0],
  };
}
function element(id = randomUUID(), version = 1) {
  return {
    id,
    type: 'rectangle',
    version,
    versionNonce: version,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    isDeleted: false,
  };
}
async function multipart(
  buffer: Uint8Array,
  name: string,
  mime: string,
  cookie: string,
  boardId?: string,
  excalidrawId?: string,
) {
  const form = new FormData();
  if (boardId) form.append('boardId', boardId);
  if (excalidrawId) form.append('excalidrawId', excalidrawId);
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), name);
  const encoded = new Request('http://localhost', { method: 'POST', body: form });
  const r = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/files',
    headers: { cookie, origin, 'content-type': encoded.headers.get('content-type')! },
    payload: Buffer.from(await encoded.arrayBuffer()),
  });
  return { status: r.statusCode, body: r.json() };
}
before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'osnova-api-'));
  const testUrl = process.env.OSNOVA_TEST_DATABASE_URL;
  if (testUrl)
    assert.match(
      new URL(testUrl).pathname,
      /^\/osnova_test/,
      'PostgreSQL tests must use a dedicated osnova_test database',
    );
  const db = await openDatabase(testUrl, 'memory://');
  ctx = await createApp({ dataDir, origin, logger: false, reminders: false }, db);
  await ctx.app.ready();
  const setup = await request(
    'POST',
    '/auth/setup',
    {
      name: 'Тестовый преподаватель',
      email: 'teacher@example.test',
      password: 'test-password-2026',
    },
    '',
  );
  assert.equal(setup.status, 200);
  teacherCookie = setup.cookie;
  student = (await request('POST', '/students', { name: 'Демо-ученик А', grade: '9 класс' })).body;
  student2 = (await request('POST', '/students', { name: 'Демо-ученик Б', grade: '11 класс' }))
    .body;
  for (const [s, email, key] of [
    [student, 'a@example.test', 'a'],
    [student2, 'b@example.test', 'b'],
  ]) {
    const i = (await request('POST', `/students/${(s as any).id}/invite`, {})).body;
    const r = await request(
      'POST',
      '/invites/redeem',
      {
        token: new URL(i.url).hash.slice(1),
        name: (s as any).name,
        email,
        password: 'student-password-2026',
      },
      '',
    );
    assert.equal(r.status, 200);
    if (key === 'a') studentCookie = r.cookie;
    else otherStudentCookie = r.cookie;
  }
  board = (await request('POST', '/boards', { title: 'Тестовая доска', studentId: student.id }))
    .body;
  page = (await request('GET', `/boards/${board.id}`)).body.pages[0];
  invite = (
    await request('POST', `/boards/${board.id}/invites`, {
      permission: 'edit',
      hours: 1,
      maxUses: 1,
    })
  ).body;
  const guest = await request(
    'POST',
    '/invites/redeem',
    { token: new URL(invite.url).hash.slice(1), name: 'Демо-гость' },
    '',
  );
  assert.equal(guest.status, 200, JSON.stringify(guest.body));
  guestCookie = guest.cookie;
  const view = (
    await request('POST', `/boards/${board.id}/invites`, {
      permission: 'view',
      hours: 1,
      maxUses: 1,
    })
  ).body;
  const viewer = await request(
    'POST',
    '/invites/redeem',
    { token: new URL(view.url).hash.slice(1), name: 'Демо-зритель' },
    '',
  );
  assert.equal(viewer.status, 200, JSON.stringify(viewer.body));
  viewCookie = viewer.cookie;
});
after(async () => {
  await ctx.app.close();
  await ctx.db.close();
  await rm(dataDir, { recursive: true, force: true });
});

test('remembering a login uses a persistent cookie; unchecked login uses a limited browser session', async () => {
  for (const rememberMe of [undefined, true, false]) {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: {
        email: 'teacher@example.test',
        password: 'test-password-2026',
        ...(rememberMe === undefined ? {} : { rememberMe }),
      },
    });
    assert.equal(r.statusCode, 200, r.body);
    const cookie = String(r.headers['set-cookie']);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    if (rememberMe === false) assert.doesNotMatch(cookie, /Max-Age|Expires=/i);
    else assert.match(cookie, /Max-Age=1209600/i);
    const token = cookie.split(';')[0];
    const session = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: token },
    });
    assert.equal(session.statusCode, 200);
    const sessions = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      headers: { cookie: token },
    });
    const current = sessions.json().find((s: any) => s.current);
    const hours = (Date.parse(current.expires_at) - Date.now()) / 3600000;
    assert.ok(
      hours > (rememberMe === false ? 23 : 335) && hours <= (rememberMe === false ? 24 : 336),
    );
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin, cookie: token },
      payload: {},
    });
  }
});

test('bootstrap is single use; authentication and CSRF are enforced', async () => {
  assert.equal(
    (
      await request(
        'POST',
        '/auth/setup',
        { name: 'Другой', email: 'x@example.test', password: 'long-password-2026' },
        '',
      )
    ).status,
    409,
  );
  assert.equal((await request('GET', '/boards', undefined, '')).status, 401);
  const r = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/boards',
    headers: { cookie: teacherCookie, origin: 'https://evil.test' },
    payload: { title: 'CSRF' },
  });
  assert.equal(r.statusCode, 403);
  const me = (await request('GET', '/me')).body;
  assert.equal(me.password_hash, undefined);
  assert.equal(me.role, 'teacher');
});
test('a different student cannot read a board by guessed URL or page ID', async () => {
  assert.equal((await request('GET', `/boards/${board.id}`, undefined, studentCookie)).status, 200);
  assert.equal(
    (await request('GET', `/boards/${board.id}`, undefined, otherStudentCookie)).status,
    404,
  );
  assert.equal(
    (await request('GET', `/pages/${page.id}/snapshot`, undefined, otherStudentCookie)).status,
    404,
  );
  assert.equal(
    (
      await request(
        'POST',
        `/pages/${page.id}/operations`,
        { operationId: randomUUID(), changes: [{ element: element(), baseVersion: null }] },
        viewCookie,
      )
    ).status,
    403,
  );
});
test('element operations merge independent edits; retries are idempotent and stale edits conflict', async () => {
  const a = element(),
    b = element();
  const op = randomUUID();
  const r = await request('POST', `/pages/${page.id}/operations`, {
    operationId: op,
    changes: [{ element: a, baseVersion: null }],
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.revision, 1);
  const [repeat, other] = await Promise.all([
    request('POST', `/pages/${page.id}/operations`, {
      operationId: op,
      changes: [{ element: a, baseVersion: null }],
    }),
    request(
      'POST',
      `/pages/${page.id}/operations`,
      { operationId: randomUUID(), changes: [{ element: b, baseVersion: null }] },
      guestCookie,
    ),
  ]);
  assert.equal(repeat.body.duplicate, true);
  assert.equal(other.status, 200);
  const updated = { ...a, version: 2, versionNonce: 2, x: 200 };
  assert.equal(
    (
      await request('POST', `/pages/${page.id}/operations`, {
        operationId: randomUUID(),
        changes: [{ element: updated, baseVersion: 1 }],
      })
    ).body.conflicts.length,
    0,
  );
  const stale = await request(
    'POST',
    `/pages/${page.id}/operations`,
    {
      operationId: randomUUID(),
      changes: [{ element: { ...a, version: 2, x: 500 }, baseVersion: 1 }],
    },
    guestCookie,
  );
  assert.equal(stale.body.conflicts.length, 1);
  assert.equal(stale.body.conflicts[0].x, 200);
  const scene = (await request('GET', `/pages/${page.id}/snapshot`)).body.scene;
  assert.equal(scene.length, 2);
  assert.equal(scene.find((e: any) => e.id === a.id).x, 200);
  const tombstone = { ...updated, isDeleted: true, version: 3, versionNonce: 3 };
  await request('POST', `/pages/${page.id}/operations`, {
    operationId: randomUUID(),
    changes: [{ element: tombstone, baseVersion: 2 }],
  });
  const replay = await request(
    'POST',
    `/pages/${page.id}/operations`,
    { operationId: randomUUID(), changes: [{ element: updated, baseVersion: 1 }] },
    guestCookie,
  );
  assert.equal(replay.body.conflicts[0].isDeleted, true);
});
test('history restore uses a revision lease and retains a recoverable prior version', async () => {
  const history = (await request('GET', `/pages/${page.id}/history`)).body;
  assert.ok(history.length >= 3);
  const current = (await request('GET', `/pages/${page.id}/snapshot`)).body;
  const stale = await request('POST', `/pages/${page.id}/restore`, {
    snapshotId: history[0].id,
    expectedRevision: 0,
  });
  assert.equal(stale.status, 409);
  const restore = await request('POST', `/pages/${page.id}/restore`, {
    snapshotId: history[0].id,
    expectedRevision: current.revision,
  });
  assert.equal(restore.status, 200);
  assert.equal(restore.body.revision, current.revision + 1);
  assert.equal(
    (await request('GET', `/pages/${page.id}/history`, undefined, studentCookie)).status,
    403,
  );
});
test('invitation use limit, revocation, member removal and archive protect write access', async () => {
  assert.equal(
    (
      await request(
        'POST',
        '/invites/redeem',
        { token: new URL(invite.url).hash.slice(1), name: 'Ещё гость' },
        '',
      )
    ).status,
    410,
  );
  await request('DELETE', `/invites/${invite.id}`);
  assert.equal(
    (await request('GET', `/pages/${page.id}/snapshot`, undefined, guestCookie)).status,
    401,
  );
  await request('DELETE', `/boards/${board.id}/members/${student.user_id}`);
  assert.equal((await request('GET', `/boards/${board.id}`, undefined, studentCookie)).status, 404);
  await request('PATCH', `/boards/${board.id}`, { archived: true });
  assert.equal(
    (
      await request('POST', `/pages/${page.id}/operations`, {
        operationId: randomUUID(),
        changes: [{ element: element(), baseVersion: null }],
      })
    ).status,
    403,
  );
  await request('PATCH', `/boards/${board.id}`, { archived: false });
});
test('private uploads validate signatures and PDF page count, with no cross-student file access', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP3cAAAAASUVORK5CYII=',
    'base64',
  );
  assert.equal(
    (await multipart(Buffer.from('<svg>bad</svg>'), 'bad.png', 'image/png', teacherCookie)).status,
    415,
  );
  assert.equal((await multipart(png, 'bad.pdf', 'application/pdf', teacherCookie)).status, 415);
  const file = await multipart(png, 'пример.png', 'image/png', teacherCookie);
  assert.equal(file.status, 200);
  assert.equal(
    (
      await ctx.app.inject({
        url: `/api/v1/files/${file.body.id}`,
        headers: { cookie: otherStudentCookie },
      })
    ).statusCode,
    404,
  );
  const record = await request('POST', '/records/material', {
    data: {
      title: 'Доступный материал',
      fileIds: [file.body.id],
      shared: true,
      studentIds: [student.id],
    },
  });
  assert.equal(record.status, 200);
  assert.equal(
    (
      await ctx.app.inject({
        url: `/api/v1/files/${file.body.id}`,
        headers: { cookie: studentCookie },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await ctx.app.inject({
        url: `/api/v1/files/${file.body.id}`,
        headers: { cookie: otherStudentCookie },
      })
    ).statusCode,
    404,
  );
  const pdf = await PDFDocument.create();
  for (let n = 0; n < 31; n++) pdf.addPage();
  assert.equal(
    (await multipart(await pdf.save(), 'many.pdf', 'application/pdf', teacherCookie)).status,
    413,
  );
});
test('homework follows assignment → draft → submission → review with isolated permissions', async () => {
  const hw = (
    await request('POST', '/records/homework', {
      studentId: student.id,
      data: {
        title: 'Синтаксис',
        description: 'Разберите предложение',
        due: new Date(Date.now() + 86400000).toISOString(),
        status: 'assigned',
        maxScore: 10,
      },
    })
  ).body;
  const list = (await request('GET', '/records/homework', undefined, otherStudentCookie)).body;
  assert.ok(!list.some((h: any) => h.id === hw.id));
  assert.equal(
    (await request('PATCH', `/records/homework/${hw.id}`, { data: { score: 10 } }, studentCookie))
      .status,
    400,
  );
  const submit = await request(
    'PATCH',
    `/records/homework/${hw.id}`,
    { data: { answer: 'Ответ ученика', status: 'submitted' } },
    studentCookie,
  );
  assert.equal(submit.status, 200);
  assert.equal(
    (await request('GET', '/records/notification')).body.some(
      (n: any) => n.data.title === 'Работа ждёт проверки',
    ),
    true,
  );
  assert.equal(
    (
      await request('PATCH', `/records/homework/${hw.id}`, {
        data: { score: 11, status: 'reviewed' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('PATCH', `/records/homework/${hw.id}`, {
        data: { score: 8, feedback: 'Повторить пунктуацию', status: 'reviewed' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        'PATCH',
        `/records/homework/${hw.id}`,
        { data: { answer: 'Новый ответ', status: 'submitted' } },
        studentCookie,
      )
    ).status,
    409,
  );
  assert.ok(
    (await request('GET', '/records/notification', undefined, studentCookie)).body.some(
      (n: any) => n.data.title === 'Работа проверена',
    ),
  );
  assert.equal(
    (await request('GET', '/records/transaction', undefined, studentCookie)).body.length,
    0,
  );
});
test('reminders are deduplicated and respect disabled reminders', async () => {
  await request('PATCH', '/me', { settings: { quietStart: '00:00', quietEnd: '00:00' } });
  const lesson = await request('POST', '/records/lesson', {
    studentId: student.id,
    data: {
      title: 'Тест напоминания',
      start: new Date(Date.now() + 5 * 60000).toISOString(),
      duration: 60,
      price: 1500,
      status: 'planned',
    },
  });
  assert.equal(lesson.status, 200);
  await tickNotifications({ ...ctx, config: ctx.config });
  await tickNotifications({ ...ctx, config: ctx.config });
  const reminders = (await request('GET', '/records/notification')).body.filter(
    (n: any) =>
      n.data.dedupeKey ===
      `reminder:${lesson.body.id}:${lesson.body.data.start}:${lesson.body.owner_id}`,
  );
  assert.equal(reminders.length, 1);
});
test('data survives closing and reopening a persistent local database', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'osnova-persist-'));
  const first = await createApp({ dataDir: dir, logger: false, reminders: false });
  await first.app.ready();
  const setup = await first.app.inject({
    method: 'POST',
    url: '/api/v1/auth/setup',
    payload: {
      name: 'Тест сохранения',
      email: 'persistence@example.test',
      password: 'long-password-2026',
    },
  });
  const cookie = String(setup.headers['set-cookie']).split(';')[0];
  const created = await first.app.inject({
    method: 'POST',
    url: '/api/v1/boards',
    headers: { cookie },
    payload: { title: 'Сохраняется после рестарта' },
  });
  assert.equal(created.statusCode, 200);
  const id = created.json().id;
  await first.app.close();
  const second = await createApp({ dataDir: dir, logger: false, reminders: false });
  await second.app.ready();
  assert.equal(
    (await second.app.inject({ url: `/api/v1/boards/${id}`, headers: { cookie } })).statusCode,
    200,
  );
  await second.app.close();
  await rm(dir, { recursive: true, force: true });
});
test('backup and restore verify checksums and recover a board into a new directory', async () => {
  const run = promisify(execFile),
    dir = await mkdtemp(path.join(tmpdir(), 'osnova-backup-')),
    target = path.join(dir, 'restored');
  const source = path.join(dir, 'source'),
    { app } = await createApp({ dataDir: source, logger: false, reminders: false });
  await app.ready();
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/setup',
    payload: {
      name: 'Backup demo',
      email: 'backup@example.test',
      password: 'backup-password-2026',
    },
  });
  const cookie = String(setup.headers['set-cookie']).split(';')[0];
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/boards',
    headers: { cookie },
    payload: { title: 'Копия учебной доски' },
  });
  const id = created.json().id;
  await app.close();
  const backup = await run(process.execPath, ['--import', 'tsx', 'scripts/backup.ts'], {
    env: { ...process.env, DATA_DIR: source, DATABASE_URL: '' },
  });
  const folder = backup.stdout.trim().split('создана: ')[1];
  assert.ok(folder);
  await run(process.execPath, ['--import', 'tsx', 'scripts/restore.ts', folder, target]);
  const restored = await createApp({ dataDir: target, logger: false, reminders: false });
  await restored.app.ready();
  assert.equal(
    (await restored.app.inject({ url: `/api/v1/boards/${id}`, headers: { cookie } })).statusCode,
    200,
  );
  await restored.app.close();
  await rm(folder, { recursive: true, force: true });
  await rm(dir, { recursive: true, force: true });
});

test('single canvas migration preserves old pages and is idempotent; background respects access rights', async () => {
  const b = (
    await request('POST', '/boards', { title: 'Все материалы на холсте', studentId: student.id })
  ).body;
  const first = (await request('GET', `/boards/${b.id}`)).body.pages[0];
  const second = (
    await request('POST', `/boards/${b.id}/pages`, { title: 'Старая вторая страница' })
  ).body;
  const a = element(),
    c = element();
  for (const [p, e] of [
    [first, a],
    [second, c],
  ])
    assert.equal(
      (
        await request('POST', `/pages/${p.id}/operations`, {
          operationId: randomUUID(),
          changes: [{ element: e, baseVersion: null }],
        })
      ).status,
      200,
    );
  const before = (await request('GET', `/pages/${second.id}/snapshot`)).body;
  const migrated = await request('POST', `/boards/${b.id}/canvas`, {});
  assert.equal(migrated.status, 200);
  assert.equal(migrated.body.canvas_page_id, first.id);
  const snapshot = (await request('GET', `/pages/${first.id}/snapshot`)).body;
  assert.equal(snapshot.scene.filter((e: any) => !e.isDeleted).length, 2);
  const again = await request('POST', `/boards/${b.id}/canvas`, {});
  assert.equal(again.body.canvas_page_id, first.id);
  assert.equal(
    (await request('GET', `/pages/${first.id}/snapshot`)).body.revision,
    snapshot.revision,
  );
  assert.deepEqual((await request('GET', `/pages/${second.id}/snapshot`)).body, before);
  assert.equal(
    (
      await request('POST', `/pages/${second.id}/operations`, {
        operationId: randomUUID(),
        changes: [{ element: element(), baseVersion: null }],
      })
    ).status,
    409,
  );
  assert.equal(
    (await request('POST', `/boards/${b.id}/pages`, { title: 'Ненужная страница' })).status,
    409,
  );
  assert.equal((await request('DELETE', `/pages/${first.id}`)).status, 409);
  assert.equal(
    (await request('PATCH', `/boards/${b.id}`, { background: 'dots' }, studentCookie)).status,
    200,
  );
  assert.equal((await request('GET', `/boards/${b.id}`)).body.background, 'dots');
  const invitation = (
    await request('POST', `/boards/${b.id}/invites`, { permission: 'view', hours: 1, maxUses: 1 })
  ).body;
  const viewer = (
    await request(
      'POST',
      '/invites/redeem',
      { token: new URL(invitation.url).hash.slice(1), name: 'Зритель общего холста' },
      '',
    )
  ).cookie;
  assert.equal(
    (await request('PATCH', `/boards/${b.id}`, { background: 'grid' }, viewer)).status,
    403,
  );
  assert.equal(
    (await request('PATCH', `/boards/${b.id}`, { background: 'unsupported' })).status,
    400,
  );
});

test('formatted text uses private board files, validates metadata and persists fractional layer order', async () => {
  const b = (await request('POST', '/boards', { title: 'Демо форматированный текст' })).body;
  const full = (await request('POST', `/boards/${b.id}/canvas`, {})).body,
    id = full.canvas_page_id;
  const fileId = randomUUID(),
    png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP3cAAAAASUVORK5CYII=',
      'base64',
    );
  const file = await multipart(png, 'Текст.png', 'image/png', teacherCookie, b.id, fileId);
  assert.equal(file.status, 200);
  const rich = {
    text: 'Площадь круга: S = πr²',
    family: 'literata',
    fontSize: 24,
    bold: true,
    italic: false,
    underline: true,
    align: 'center',
    color: '#6038ff',
  };
  const text = {
    ...element(),
    type: 'image',
    fileId,
    index: 'a1',
    customData: { richText: rich, richTextSize: { width: 100, height: 100 } },
  };
  const background = { ...element(), index: 'a0' };
  let r = await request('POST', `/pages/${id}/operations`, {
    operationId: randomUUID(),
    changes: [
      { element: text, baseVersion: null },
      { element: background, baseVersion: null },
    ],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const stored = (await request('GET', `/pages/${id}/snapshot`)).body.scene;
  assert.deepEqual(
    stored.map((e: any) => e.id),
    [background.id, text.id],
  );
  assert.deepEqual(stored[1].customData.richText, rich);
  r = await request('POST', `/pages/${id}/operations`, {
    operationId: randomUUID(),
    changes: [{ element: { ...text, version: 2, index: 'Zz' }, baseVersion: 1 }],
  });
  assert.equal(r.status, 200);
  assert.equal((await request('GET', `/pages/${id}/snapshot`)).body.scene[0].id, text.id);
  const malformed = { ...text, version: 3, customData: { richText: { ...rich, fontSize: NaN } } };
  assert.equal(
    (
      await request('POST', `/pages/${id}/operations`, {
        operationId: randomUUID(),
        changes: [{ element: malformed, baseVersion: 2 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('POST', `/pages/${id}/operations`, {
        operationId: randomUUID(),
        changes: [
          {
            element: {
              ...text,
              version: 3,
              customData: { richText: { ...rich, text: 'x'.repeat(20001) } },
            },
            baseVersion: 2,
          },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await ctx.app.inject({
        url: `/api/v1/files/${file.body.id}`,
        headers: { cookie: otherStudentCookie },
      })
    ).statusCode,
    404,
  );
});
