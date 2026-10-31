import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '../packages/contracts';
import { layoutDayEvents } from '../apps/web/src/pages/schedule-layout';

const lesson = (id: string, start: string, duration: number): Entry => ({
  id,
  kind: 'lesson',
  owner_id: 'teacher',
  student_id: null,
  data: { title: id, start, duration, status: 'planned' },
  created_at: start,
  updated_at: start,
});

test('separate lessons and lessons meeting at an exact boundary use the full day column', () => {
  const events = layoutDayEvents(
    [
      lesson('evening', '2026-10-27T19:00:00+03:00', 60),
      lesson('first', '2026-10-27T16:00:00+03:00', 60),
      lesson('next', '2026-10-27T17:00:00+03:00', 60),
    ],
    '2026-10-27',
  );
  assert.deepEqual(
    events.map(({ entry, column, columns }) => [entry.id, column, columns]),
    [
      ['first', 0, 1],
      ['next', 0, 1],
      ['evening', 0, 1],
    ],
  );
});

test('simultaneous lessons have distinct columns and reuse a free column within an overlap group', () => {
  const events = layoutDayEvents(
    [
      lesson('long', '2026-10-27T16:00:00+03:00', 120),
      lesson('short', '2026-10-27T16:30:00+03:00', 30),
      lesson('third', '2026-10-27T16:45:00+03:00', 30),
      lesson('following', '2026-10-27T17:00:00+03:00', 30),
      lesson('separate', '2026-10-27T19:00:00+03:00', 60),
    ],
    '2026-10-27',
  );
  const byId = new Map(events.map((event) => [event.entry.id, event]));
  const simultaneous = ['long', 'short', 'third'].map((id) => byId.get(id)!);
  assert.equal(new Set(simultaneous.map((event) => event.column)).size, 3);
  assert.ok(simultaneous.every((event) => event.columns === 3));
  assert.equal(byId.get('following')!.column, byId.get('short')!.column);
  assert.notEqual(byId.get('following')!.column, byId.get('third')!.column);
  assert.equal(byId.get('following')!.columns, 3);
  assert.equal(byId.get('separate')!.columns, 1);
});

test('midnight-spanning lessons are clipped to the Moscow day and exact outside boundaries are excluded', () => {
  const events = layoutDayEvents(
    [
      // In Moscow this begins at 23:30 on the previous day and ends at 01:30.
      lesson('overnight', '2026-10-26T20:30:00Z', 120),
      // Its UTC date is the previous date, but it belongs to 27 October in Moscow.
      lesson('early', '2026-10-26T21:30:00Z', 30),
      lesson('late', '2026-10-27T20:30:00Z', 120),
      lesson('ended-at-midnight', '2026-10-26T20:00:00Z', 60),
      lesson('starts-next-midnight', '2026-10-27T21:00:00Z', 60),
    ],
    '2026-10-27',
  );
  assert.deepEqual(
    events.map(({ entry, start, end }) => [entry.id, start, end]),
    [
      ['overnight', 0, 90],
      ['early', 30, 60],
      ['late', 1410, 1440],
    ],
  );
});
