import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/api/src/app';
import { openDatabase, type Database } from '../apps/api/src/db';

test('curriculum migrates an existing pupil, persists across restart, and protects writes and private materials', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'osnova-curriculum-'));
  const origin = 'http://localhost:5173';
  let db: Database, ctx: Awaited<ReturnType<typeof createApp>>;
  const boot = async () => {
    db = await openDatabase(undefined, path.join(dir, 'postgres'));
    ctx = await createApp({ dataDir: dir, origin, logger: false, reminders: false }, db);
    await ctx.app.ready();
  };
  const close = async () => {
    await ctx.app.close();
    await db.close();
  };
  let closed = false;
  await boot();
  const request = async (method: string, url: string, payload: any, cookie = teacher) => {
    const r = await ctx.app.inject({
      method: method as any,
      url: '/api/v1' + url,
      payload,
      headers: { origin, ...(cookie ? { cookie } : {}) },
    });
    return {
      status: r.statusCode,
      body: r.json(),
      cookie: String(r.headers['set-cookie'] || '').split(';')[0],
    };
  };
  let teacher = '';
  try {
    const setup = await request('POST', '/auth/setup', {
      name: 'Демо преподаватель',
      email: 'program@example.test',
      password: 'curriculum-test-password',
    });
    assert.equal(setup.status, 200);
    teacher = setup.cookie;
    const pupil = (
      await request('POST', '/students', {
        name: 'Демо ученик',
        program: 'Прежняя программа\nВажный текст',
        goal: 'Прежняя цель',
      })
    ).body;
    const other = (await request('POST', '/students', { name: 'Другой демо ученик' })).body;
    assert.equal(pupil.curriculum, null);
    await db!.query('ALTER TABLE students DROP COLUMN curriculum');
    await close();
    closed = true;
    await boot();
    closed = false;
    let found = (await request('GET', '/students', undefined)).body.find(
      (value: any) => value.id === pupil.id,
    );
    assert.equal(found.program, pupil.program);
    assert.equal(found.goal, pupil.goal);
    assert.equal(found.curriculum, null);
    const material = async (title: string, shared: boolean, studentIds: string[]) => {
      const response = await request('POST', '/records/material', {
        data: { title, shared, studentIds, fileIds: [] },
      });
      assert.equal(response.status, 200);
      return response.body;
    };
    const privateMaterial = await material('Личная подготовка', false, []);
    const shared = await material('Материал ученика', true, [pupil.id]);
    const otherMaterial = await material('Материал другого ученика', true, [other.id]);
    const curriculum = {
      version: 1,
      lessonsPerWeek: 2,
      duration: 60,
      blocks: [
        {
          id: randomUUID(),
          title: 'Синтаксис',
          topics: [
            {
              id: randomUUID(),
              title: 'Оборот',
              status: 'auto',
              materialIds: [privateMaterial.id, shared.id, otherMaterial.id],
            },
          ],
        },
      ],
    };
    let saved = await request('PATCH', `/students/${pupil.id}`, { curriculum });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.curriculum, curriculum);
    assert.equal(saved.body.program, pupil.program);
    assert.equal(
      (
        await request('PATCH', `/students/${pupil.id}`, {
          curriculum: { ...curriculum, duration: 5 },
        })
      ).status,
      400,
    );
    const unknown = structuredClone(curriculum);
    unknown.blocks[0].topics[0].materialIds = [randomUUID()];
    assert.equal(
      (await request('PATCH', `/students/${pupil.id}`, { curriculum: unknown })).status,
      403,
    );
    const invite = (await request('POST', `/students/${pupil.id}/invite`, {})).body;
    const login = await request(
      'POST',
      '/invites/redeem',
      {
        token: new URL(invite.url).hash.slice(1),
        name: 'Демо ученик',
        email: 'pupil-program@example.test',
        password: 'pupil-test-password',
      },
      '',
    );
    assert.equal(login.status, 200);
    const own = (await request('GET', '/students', undefined, login.cookie)).body;
    assert.equal(own.length, 1);
    assert.equal(own[0].id, pupil.id);
    assert.deepEqual(own[0].curriculum.blocks[0].topics[0].materialIds, [shared.id]);
    assert.equal(
      (await request('PATCH', `/students/${pupil.id}`, { curriculum: null }, login.cookie)).status,
      403,
    );
    const owner = (
      await db!.query('SELECT id,password_hash FROM users WHERE email=$1', ['program@example.test'])
    ).rows[0];
    await db!.query(
      "INSERT INTO users(id,role,name,email,password_hash) VALUES($1,'teacher',$2,$3,$4)",
      [randomUUID(), 'Другой преподаватель', 'foreign-program@example.test', owner.password_hash],
    );
    const foreign = await request(
      'POST',
      '/auth/login',
      { email: 'foreign-program@example.test', password: 'curriculum-test-password' },
      '',
    );
    assert.equal(foreign.status, 200);
    assert.equal(
      (await request('PATCH', `/students/${pupil.id}`, { curriculum: null }, foreign.cookie))
        .status,
      404,
    );
    const foreignMaterial = (
      await request(
        'POST',
        '/records/material',
        { data: { title: 'Чужой материал', shared: false } },
        foreign.cookie,
      )
    ).body;
    unknown.blocks[0].topics[0].materialIds = [foreignMaterial.id];
    assert.equal(
      (await request('PATCH', `/students/${pupil.id}`, { curriculum: unknown })).status,
      403,
    );
    await request('DELETE', `/records/material/${privateMaterial.id}`, undefined);
    saved = await request('PATCH', `/students/${pupil.id}`, { name: 'Обновлённое имя' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.curriculum, curriculum);
    await close();
    closed = true;
    await boot();
    closed = false;
    found = (await request('GET', '/students', undefined)).body.find(
      (value: any) => value.id === pupil.id,
    );
    assert.equal(found.name, 'Обновлённое имя');
    assert.equal(found.program, pupil.program);
    assert.deepEqual(found.curriculum, curriculum);
  } finally {
    if (!closed) await close();
    await rm(dir, { recursive: true, force: true });
  }
});
