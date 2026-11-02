import type {
  CurriculumTopic,
  Entry,
  RecordKind,
  Student,
  StudentCurriculum,
} from '../../../../packages/contracts';

export const topicKey = (title: string) =>
  title
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const programStatusLabels = {
  planned: 'Запланировано',
  learning: 'Сейчас изучаем',
  mastered: 'Освоено',
};

export function individualProgramData(
  student: Student,
  records: Record<RecordKind, Entry[]>,
  now: number,
) {
  const latest = new Map<string, Entry>();
  const results = records.result
    .filter((entry) => entry.student_id === student.id)
    .sort(
      (a, b) =>
        Date.parse(b.data.date) - Date.parse(a.data.date) ||
        Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
        a.id.localeCompare(b.id),
    );
  for (const result of results)
    if (!latest.has(topicKey(result.data.topic))) latest.set(topicKey(result.data.topic), result);
  const blocks = (student.curriculum?.blocks || []).map((block) => {
    const topics = block.topics.map((topic) => {
      const result = latest.get(topicKey(topic.title));
      const status: Exclude<CurriculumTopic['status'], 'auto'> =
        topic.status !== 'auto'
          ? topic.status
          : result?.data.skill === 'mastered'
            ? 'mastered'
            : result
              ? 'learning'
              : 'planned';
      return { ...topic, status, result };
    });
    const mastered = topics.filter((topic) => topic.status === 'mastered').length;
    const status =
      topics.length && mastered === topics.length
        ? 'mastered'
        : topics.some((topic) => topic.status !== 'planned')
          ? 'learning'
          : 'planned';
    return { ...block, topics, mastered, status };
  });
  const lessons = records.lesson
    .filter(
      (entry) =>
        (entry.student_id === student.id || entry.data.studentIds?.includes(student.id)) &&
        (entry.data.status === 'live' ||
          (['planned', 'rescheduled'].includes(entry.data.status) &&
            Date.parse(entry.data.start) + entry.data.duration * 60_000 > now)),
    )
    .sort(
      (a, b) =>
        Number(b.data.status === 'live') - Number(a.data.status === 'live') ||
        Date.parse(a.data.start) - Date.parse(b.data.start),
    )
    .slice(0, 3);
  const repeat = [...latest.values()].filter((entry) => entry.data.skill === 'repeat');
  return { blocks, lessons, repeat };
}

// Explicit import into the draft; the original programme text remains on the student.
export function importProgramText(
  text: string,
  makeId = () => crypto.randomUUID(),
): StudentCurriculum['blocks'] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((part) => {
      const lines = part
        .split('\n')
        .map((line) => line.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, '').trim())
        .filter(Boolean);
      return {
        id: makeId(),
        title: lines[0],
        topics: lines
          .slice(1)
          .map((title) => ({ id: makeId(), title, status: 'auto' as const, materialIds: [] })),
      };
    });
}
