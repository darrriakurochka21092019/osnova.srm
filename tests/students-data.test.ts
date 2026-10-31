import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Classroom, Entry, Student } from '../packages/contracts';
import {
  groupPrograms,
  studentHomework,
  upcomingLesson,
} from '../apps/web/src/pages/students-data';

const now = new Date('2026-10-31T12:00:00Z').getTime();
const entry = (
  id: string,
  data: Record<string, unknown>,
  studentId = 'pupil',
  updated = '2026-10-31T12:00:00Z',
): Entry => ({
  id,
  kind: 'lesson',
  owner_id: 'teacher',
  student_id: studentId,
  data: { title: id, start: '2026-10-31T13:30:00Z', duration: 60, status: 'planned', ...data },
  created_at: updated,
  updated_at: updated,
});
const matchesPupil = (lesson: Entry) =>
  lesson.student_id === 'pupil' || lesson.data.studentIds?.includes('pupil');

test('upcoming lessons exclude cancelled, completed, ended and unrelated records but include a group member', () => {
  const lessons = [
    entry('cancelled', { status: 'cancelled', start: '2026-10-31T12:05:00Z' }),
    entry('completed', { status: 'completed', start: '2026-10-31T12:10:00Z' }),
    entry('ended', { start: '2026-10-31T10:00:00Z' }),
    entry('ended-at-now', { status: 'rescheduled', start: '2026-10-31T11:00:00Z' }),
    entry('unrelated-live', { status: 'live' }, 'another-pupil'),
    entry('individual', {}),
    entry('group', { start: '2026-10-31T12:30:00Z', studentIds: ['pupil'] }, 'another-pupil'),
  ];
  assert.equal(upcomingLesson(lessons, matchesPupil, now)?.id, 'group');
  assert.equal(upcomingLesson(lessons.slice(0, 5), matchesPupil, now), undefined);
});

test('a live lesson takes priority and an ongoing scheduled lesson remains available until its end', () => {
  const ongoing = entry('ongoing', { start: '2026-10-31T11:30:00Z' });
  const future = entry('future', {});
  const live = entry('live', { start: '2026-10-31T08:00:00Z', status: 'live' });
  assert.equal(upcomingLesson([future, ongoing], matchesPupil, now)?.id, 'ongoing');
  assert.equal(upcomingLesson([future, ongoing, live], matchesPupil, now)?.id, 'live');
});

test('upcoming lessons compare actual times across different ISO timezone offsets', () => {
  const earlierMoscow = entry('earlier', { start: '2026-10-31T15:30:00+03:00' });
  const laterUtc = entry('later', { start: '2026-10-31T13:00:00Z' });
  assert.equal(upcomingLesson([laterUtc, earlierMoscow], matchesPupil, now)?.id, 'earlier');
});

test('homework keeps student isolation and prioritizes submitted work over assigned and reviewed work', () => {
  const homework = [
    entry('foreign', { status: 'submitted' }, 'another-pupil'),
    entry('assigned', { status: 'assigned' }),
    entry('reviewed', { status: 'reviewed' }),
    entry('submitted', { status: 'submitted' }, 'pupil', '2026-10-27T12:00:00Z'),
  ];
  assert.equal(studentHomework(homework, 'pupil')?.id, 'submitted');
  assert.equal(studentHomework(homework, 'missing-pupil'), undefined);
});

test('assigned and draft homework share priority, use the latest update and precede reviewed work', () => {
  const assigned = entry('assigned', { status: 'assigned' }, 'pupil', '2026-10-29T12:00:00Z');
  const draft = entry('draft', { status: 'draft' }, 'pupil', '2026-10-30T12:00:00Z');
  const reviewed = entry('reviewed', { status: 'reviewed' }, 'pupil', '2026-10-31T12:00:00Z');
  assert.equal(studentHomework([reviewed, assigned, draft], 'pupil')?.id, 'draft');
  assert.equal(studentHomework([reviewed, assigned], 'pupil')?.id, 'assigned');
  assert.equal(studentHomework([reviewed], 'pupil')?.id, 'reviewed');
});

test('group programmes come only from actual members, omit blanks and deduplicate trimmed names', () => {
  const pupil = (id: string, program: string): Student => ({
    id,
    program,
    name: id,
    user_id: `user-${id}`,
    grade: '9 класс',
    goal: '',
    status: 'active',
    color: 'purple',
    created_at: '2026-10-31T12:00:00Z',
  });
  const pupils = [
    pupil('first', '  ОГЭ по русскому  '),
    pupil('second', 'ОГЭ по русскому'),
    pupil('third', 'Школьная программа'),
    pupil('blank', ' '),
    pupil('outsider', 'ЕГЭ по русскому'),
  ];
  const room: Classroom = {
    id: 'group',
    owner_id: 'teacher',
    board_id: 'board',
    title: 'Мини-группа',
    kind: 'group',
    permission: 'admin',
    students: [...pupils.slice(0, 4), pupil('missing-from-pupil-list', '')].map((student) => ({
      ...student,
      permission: 'edit',
    })),
    lesson: null,
    activeSession: null,
    sessions: [],
    participants: [],
  };
  assert.deepEqual(groupPrograms(room, pupils), ['ОГЭ по русскому', 'Школьная программа']);
  assert.deepEqual(groupPrograms({ ...room, students: [] }, pupils), []);
});
