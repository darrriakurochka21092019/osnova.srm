import type { Classroom, Entry, Student } from '../../../../packages/contracts';

export function upcomingLesson(lessons: Entry[], matches: (lesson: Entry) => boolean, now: number) {
  return lessons
    .filter(
      (lesson) =>
        matches(lesson) &&
        (lesson.data.status === 'live' ||
          (['planned', 'rescheduled'].includes(lesson.data.status) &&
            new Date(lesson.data.start).getTime() + lesson.data.duration * 60_000 > now)),
    )
    .sort(
      (a, b) =>
        Number(b.data.status === 'live') - Number(a.data.status === 'live') ||
        new Date(a.data.start).getTime() - new Date(b.data.start).getTime(),
    )[0];
}

export function studentHomework(homework: Entry[], studentId: string) {
  const priorities: Record<string, number> = { submitted: 0, assigned: 1, draft: 1, reviewed: 2 };
  return homework
    .filter((entry) => entry.student_id === studentId)
    .sort(
      (a, b) =>
        (priorities[a.data.status] ?? 3) - (priorities[b.data.status] ?? 3) ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )[0];
}

export function groupPrograms(room: Classroom, students: Student[]) {
  return [
    ...new Set(
      room.students
        .map((member) => students.find((student) => student.id === member.id)?.program.trim())
        .filter((program): program is string => Boolean(program)),
    ),
  ];
}

export const homeworkLabels: Record<string, string> = {
  submitted: 'На проверке',
  assigned: 'Выдано',
  draft: 'Выдано',
  reviewed: 'Проверено',
};
