import type { Entry, RecordKind } from '../../../../packages/contracts';
import { upcomingLesson } from './students-data';

export function studentProfileData(id: string, records: Record<RecordKind, Entry[]>, now: number) {
  const ownsLesson = (entry: Entry) =>
    entry.student_id === id || entry.data.studentIds?.includes(id);
  const lessons = records.lesson
    .filter(ownsLesson)
    .sort((a, b) => Date.parse(b.data.start) - Date.parse(a.data.start));
  const completed = lessons.filter((entry) => entry.data.status === 'completed');
  const results = records.result
    .filter((entry) => entry.student_id === id)
    .sort((a, b) => Date.parse(b.data.date) - Date.parse(a.data.date));
  const payments = records.transaction
    .filter((entry) => entry.student_id === id && entry.data.type === 'payment')
    .sort((a, b) => Date.parse(b.data.date) - Date.parse(a.data.date));
  const priority: Record<string, number> = { submitted: 0, assigned: 1, draft: 1, reviewed: 2 };
  const homework = records.homework
    .filter((entry) => entry.student_id === id)
    .sort(
      (a, b) =>
        priority[a.data.status] - priority[b.data.status] ||
        Date.parse(a.data.due) - Date.parse(b.data.due),
    );
  const notes = records.note
    .filter((entry) => entry.student_id === id)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const paid = payments.reduce((sum, entry) => sum + entry.data.amount, 0);
  const charged = completed.reduce((sum, entry) => sum + entry.data.price, 0);
  const latestResult = results[0];
  const resultPercent = latestResult
    ? Math.round((latestResult.data.score / latestResult.data.maxScore) * 100)
    : null;
  return {
    lessons,
    completed,
    recent: completed.slice(0, 3),
    results,
    latestResult,
    resultPercent,
    payments,
    paid,
    charged,
    balance: paid - charged,
    homework,
    notes,
    next: upcomingLesson(lessons, ownsLesson, now),
  };
}
