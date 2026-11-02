import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  curriculumSchema,
  kinds,
  type Entry,
  type RecordKind,
  type Student,
} from '../packages/contracts';
import {
  importProgramText,
  individualProgramData,
} from '../apps/web/src/pages/individual-program-data';

const pupil: Student = {
  id: randomUUID(),
  user_id: randomUUID(),
  name: 'Демо',
  grade: '9 класс',
  goal: '',
  program: 'Старый текст',
  status: 'active',
  color: 'purple',
  created_at: '2026-01-01T00:00:00Z',
};
function records() {
  return Object.fromEntries(kinds.map((kind) => [kind, []])) as unknown as Record<
    RecordKind,
    Entry[]
  >;
}
function entry(kind: RecordKind, student: string, data: Record<string, any>): Entry {
  return {
    id: randomUUID(),
    owner_id: 'teacher',
    student_id: student,
    kind,
    data,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}
const program = () =>
  curriculumSchema.parse({
    blocks: [
      {
        id: randomUUID(),
        title: 'Синтаксис',
        topics: ['Грамматическая основа', 'Причастный оборот', 'Сложное предложение'].map(
          (title) => ({ id: randomUUID(), title }),
        ),
      },
    ],
  });

test('programme statuses use the latest assessment date, isolate pupils, and honour teacher overrides', () => {
  const student = { ...pupil, curriculum: program() };
  const data = records();
  data.result = [
    entry('result', pupil.id, {
      topic: 'Грамматическая основа',
      date: '2026-10-31T23:00:00+03:00',
      skill: 'repeat',
    }),
    entry('result', pupil.id, {
      topic: 'грамматическая   основа!',
      date: '2026-10-31T21:00:00Z',
      skill: 'mastered',
    }),
    entry('result', 'other', {
      topic: 'Причастный оборот',
      date: '2026-11-01T00:00:00Z',
      skill: 'mastered',
    }),
    entry('result', pupil.id, {
      topic: 'Причастный оборот',
      date: '2026-10-30T00:00:00Z',
      skill: 'learning',
    }),
  ];
  let view = individualProgramData(student, data, Date.now());
  assert.deepEqual(
    view.blocks[0].topics.map((topic) => topic.status),
    ['mastered', 'learning', 'planned'],
  );
  assert.equal(view.blocks[0].mastered, 1);
  assert.equal(view.blocks[0].status, 'learning');
  assert.deepEqual(view.repeat, []);
  student.curriculum.blocks[0].topics[1].status = 'mastered';
  student.curriculum.blocks[0].topics[2].status = 'mastered';
  view = individualProgramData(student, data, Date.now());
  assert.equal(view.blocks[0].status, 'mastered');
  assert.equal(view.blocks[0].mastered, 3);
});

test('repeat suggestions retain only the latest result per topic and never include another pupil', () => {
  const data = records();
  data.result = [
    entry('result', pupil.id, { topic: 'Ёлка', date: '2026-10-01T00:00:00Z', skill: 'repeat' }),
    entry('result', pupil.id, { topic: 'Елка', date: '2026-10-02T00:00:00Z', skill: 'mastered' }),
    entry('result', pupil.id, {
      topic: 'Оборот',
      date: '2026-10-03T00:00:00Z',
      skill: 'repeat',
      recommendation: 'Проверить границы',
    }),
    entry('result', 'other', {
      topic: 'Чужая тема',
      date: '2026-10-04T00:00:00Z',
      skill: 'repeat',
    }),
  ];
  const view = individualProgramData(pupil, data, Date.now());
  assert.equal(view.repeat.length, 1);
  assert.equal(view.repeat[0].data.recommendation, 'Проверить границы');
});

test('upcoming programme lessons include groups and continuing live lessons but exclude cancellations and unrelated pupils', () => {
  const data = records(),
    now = Date.parse('2026-11-02T12:00:00Z');
  const lesson = (title: string, status: string, start: string, studentId = pupil.id, extra = {}) =>
    entry('lesson', studentId, { title, status, start, duration: 60, ...extra });
  data.lesson = [
    lesson('Групповой', 'planned', '2026-11-03T00:00:00+03:00', 'other', {
      studentIds: [pupil.id],
    }),
    lesson('Идёт дольше плана', 'live', '2026-11-02T09:00:00Z'),
    lesson('Отменённый', 'cancelled', '2026-11-02T13:00:00Z'),
    lesson('Проведённый', 'completed', '2026-11-02T13:00:00Z'),
    lesson('Чужой', 'planned', '2026-11-02T13:00:00Z', 'other'),
    lesson('Закончился', 'planned', '2026-11-02T10:00:00Z'),
  ];
  assert.deepEqual(
    individualProgramData(pupil, data, now).lessons.map((value) => value.data.title),
    ['Идёт дольше плана', 'Групповой'],
  );
});

test('legacy programme text imports only on request and retains every section and long title for review', () => {
  const text = 'Синтаксис\n1. Основа\n• Оборот\n\nОрфография\n- Н и НН';
  const blocks = importProgramText(text, randomUUID);
  assert.deepEqual(
    blocks.map((block) => [block.title, ...block.topics.map((topic) => topic.title)]),
    [
      ['Синтаксис', 'Основа', 'Оборот'],
      ['Орфография', 'Н и НН'],
    ],
  );
  assert.equal(text, 'Синтаксис\n1. Основа\n• Оборот\n\nОрфография\n- Н и НН');
  assert.equal(
    importProgramText('Длинная тема\n' + 'а'.repeat(260), randomUUID)[0].topics[0].title.length,
    260,
  );
  assert.deepEqual(importProgramText('  '), []);
});

test('curriculum validation rejects duplicate identities, invalid schedules, and oversized programmes', () => {
  const data = program();
  data.blocks[0].topics[1].id = data.blocks[0].topics[0].id;
  assert.equal(curriculumSchema.safeParse(data).success, false);
  assert.equal(curriculumSchema.safeParse({ ...program(), lessonsPerWeek: 8 }).success, false);
  assert.equal(curriculumSchema.safeParse({ ...program(), duration: 10 }).success, false);
  const many = program();
  many.blocks = Array.from({ length: 6 }, () => ({
    id: randomUUID(),
    title: 'Раздел',
    topics: Array.from({ length: 100 }, () => ({
      id: randomUUID(),
      title: 'Тема',
      status: 'auto' as const,
      materialIds: [],
    })),
  }));
  assert.equal(curriculumSchema.safeParse(many).success, false);
  assert.deepEqual(individualProgramData(pupil, records(), Date.now()).blocks, []);
});
