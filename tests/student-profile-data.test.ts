import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kinds, type Entry, type RecordKind } from '../packages/contracts';
import { studentProfileData } from '../apps/web/src/pages/student-profile-data';

const now = Date.parse('2026-10-31T12:00:00Z');
const emptyRecords = (): Record<RecordKind, Entry[]> =>
  Object.fromEntries(kinds.map((kind) => [kind, [] as Entry[]])) as Record<RecordKind, Entry[]>;
const entry = (
  kind: RecordKind,
  id: string,
  data: Record<string, unknown>,
  studentId: string | null = 'pupil',
  updated = '2026-10-31T12:00:00Z',
): Entry => ({
  id,
  kind,
  owner_id: 'teacher',
  student_id: studentId,
  data: { title: id, ...data },
  created_at: updated,
  updated_at: updated,
});
const lesson = (
  id: string,
  data: Record<string, unknown> = {},
  studentId: string | null = 'pupil',
) =>
  entry(
    'lesson',
    id,
    {
      start: '2026-10-31T13:00:00Z',
      duration: 60,
      status: 'planned',
      price: 1500,
      studentIds: [],
      ...data,
    },
    studentId,
  );

test('a pupil profile includes individual and group lessons without leaking another pupil’s lessons', () => {
  const records = emptyRecords();
  records.lesson = [
    lesson('individual'),
    lesson('group', { studentIds: ['pupil', 'another-pupil'] }, null),
    lesson('other-primary-group', { studentIds: ['pupil'] }, 'another-pupil'),
    lesson('foreign', {}, 'another-pupil'),
    lesson('foreign-group', { studentIds: ['another-pupil'] }, null),
    lesson('unassigned', {}, null),
  ];
  const profile = studentProfileData('pupil', records, now);
  assert.deepEqual(profile.lessons.map((record) => record.id).sort(), [
    'group',
    'individual',
    'other-primary-group',
  ]);
  assert.deepEqual(studentProfileData('missing-pupil', records, now).lessons, []);
});

test('recent history contains the three latest completed lessons ordered by actual time', () => {
  const records = emptyRecords();
  records.lesson = [
    lesson('old', { status: 'completed', start: '2026-10-26T12:00:00Z' }),
    lesson('middle-moscow', { status: 'completed', start: '2026-10-30T15:30:00+03:00' }),
    lesson('latest-utc', { status: 'completed', start: '2026-10-30T13:00:00Z' }),
    lesson('third', { status: 'completed', start: '2026-10-29T12:00:00Z' }),
    lesson('cancelled', { status: 'cancelled', start: '2026-10-31T11:00:00Z' }),
    lesson('future'),
    lesson('foreign-completed', { status: 'completed' }, 'another-pupil'),
  ];
  const profile = studentProfileData('pupil', records, now);
  assert.equal(profile.completed.length, 4);
  assert.deepEqual(
    profile.recent.map((record) => record.id),
    ['latest-utc', 'middle-moscow', 'third'],
  );
});

test('the next lesson excludes ended, cancelled and completed lessons and can be a mini-group', () => {
  const records = emptyRecords();
  records.lesson = [
    lesson('cancelled', { status: 'cancelled', start: '2026-10-31T12:01:00Z' }),
    lesson('completed', { status: 'completed', start: '2026-10-31T12:02:00Z' }),
    lesson('ended', { status: 'rescheduled', start: '2026-10-31T11:00:00Z' }),
    lesson('foreign-live', { status: 'live' }, 'another-pupil'),
    lesson('individual'),
    lesson('group', { start: '2026-10-31T15:30:00+03:00', studentIds: ['pupil'] }, null),
  ];
  assert.equal(studentProfileData('pupil', records, now).next?.id, 'group');
  records.lesson.push(lesson('own-live', { status: 'live', start: '2026-10-31T10:00:00Z' }));
  assert.equal(studentProfileData('pupil', records, now).next?.id, 'own-live');
  assert.equal(studentProfileData('missing-pupil', records, now).next, undefined);
});

test('the balance charges completed group lessons per pupil and counts only that pupil’s payments', () => {
  const records = emptyRecords();
  records.lesson = [
    lesson('individual', { status: 'completed', price: 1500 }),
    lesson('group', { status: 'completed', price: 1800, studentIds: ['pupil', 'other'] }),
    lesson('cancelled', { status: 'cancelled', price: 9000 }),
    lesson('planned', { price: 9000 }),
    lesson('live', { status: 'live', price: 9000 }),
    lesson('rescheduled', { status: 'rescheduled', price: 9000 }),
    lesson('foreign-completed', { status: 'completed', price: 9000 }, 'another-pupil'),
  ];
  records.transaction = [
    entry('transaction', 'old-payment', {
      type: 'payment',
      amount: 2000,
      date: '2025-01-01T12:00:00Z',
    }),
    entry('transaction', 'new-payment', {
      type: 'payment',
      amount: 750,
      date: '2026-10-31T12:00:00Z',
    }),
    entry('transaction', 'income', { type: 'income', amount: 9000, date: '2026-10-31T12:00:00Z' }),
    entry('transaction', 'expense', {
      type: 'expense',
      amount: 9000,
      date: '2026-10-31T12:00:00Z',
    }),
    entry(
      'transaction',
      'foreign-payment',
      { type: 'payment', amount: 9000, date: '2026-10-31T12:00:00Z' },
      'another-pupil',
    ),
  ];
  const profile = studentProfileData('pupil', records, now);
  assert.equal(profile.paid, 2750);
  assert.equal(profile.charged, 3300);
  assert.equal(profile.balance, -550);
  assert.deepEqual(
    profile.payments.map((record) => record.id),
    ['new-payment', 'old-payment'],
  );
  records.transaction.push(
    entry('transaction', 'advance', {
      type: 'payment',
      amount: 1000,
      date: '2026-10-31T13:00:00Z',
    }),
  );
  assert.equal(studentProfileData('pupil', records, now).balance, 450);
});

test('the latest result uses the assessment date across timezones and empty profiles have no invented score', () => {
  const records = emptyRecords();
  records.result = [
    entry('result', 'earlier-moscow', {
      date: '2026-10-30T15:30:00+03:00',
      score: 2,
      maxScore: 10,
    }),
    entry('result', 'latest-utc', { date: '2026-10-30T13:00:00Z', score: 6, maxScore: 8 }),
    entry(
      'result',
      'foreign-newer',
      { date: '2026-10-31T12:00:00Z', score: 10, maxScore: 10 },
      'another-pupil',
    ),
  ];
  const profile = studentProfileData('pupil', records, now);
  assert.equal(profile.latestResult?.id, 'latest-utc');
  assert.equal(profile.resultPercent, 75);
  assert.deepEqual(
    profile.results.map((record) => record.id),
    ['latest-utc', 'earlier-moscow'],
  );
  const empty = studentProfileData('missing-pupil', records, now);
  assert.equal(empty.latestResult, undefined);
  assert.equal(empty.resultPercent, null);
  assert.equal(empty.balance, 0);
});

test('private profile notes are scoped to the pupil and ordered by their last edit', () => {
  const records = emptyRecords();
  records.note = [
    entry(
      'note',
      'earlier-moscow',
      { text: 'Earlier observation' },
      'pupil',
      '2026-10-30T15:30:00+03:00',
    ),
    entry('note', 'latest-utc', { text: 'Latest observation' }, 'pupil', '2026-10-30T13:00:00Z'),
    entry(
      'note',
      'foreign',
      { text: 'Private to another pupil', studentIds: ['pupil'] },
      'another-pupil',
    ),
    entry('note', 'general-teacher-note', { text: 'Not associated with this pupil' }, null),
  ];
  assert.deepEqual(
    studentProfileData('pupil', records, now).notes.map((record) => record.id),
    ['latest-utc', 'earlier-moscow'],
  );
  assert.deepEqual(studentProfileData('missing-pupil', records, now).notes, []);
});

test('profile homework keeps pupil isolation and places work awaiting review before open and reviewed work', () => {
  const records = emptyRecords();
  records.homework = [
    entry('homework', 'reviewed', { status: 'reviewed', due: '2026-10-27T12:00:00Z' }),
    entry('homework', 'assigned', { status: 'assigned', due: '2026-11-02T12:00:00Z' }),
    entry('homework', 'draft', { status: 'draft', due: '2026-11-01T12:00:00Z' }),
    entry('homework', 'submitted', { status: 'submitted', due: '2026-11-03T12:00:00Z' }),
    entry(
      'homework',
      'foreign-submitted',
      { status: 'submitted', due: '2026-10-26T12:00:00Z' },
      'another-pupil',
    ),
  ];
  assert.deepEqual(
    studentProfileData('pupil', records, now).homework.map((record) => record.id),
    ['submitted', 'draft', 'assigned', 'reviewed'],
  );
});
