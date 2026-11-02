import { useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Target,
  Upload,
} from 'lucide-react';
import type { CurriculumTopic, Entry, RecordKind, Student } from '../../../../packages/contracts';
import { date, localInput } from '../api';
import { Brand } from '../Brand';
import { Button, FileLinks, Modal } from '../ui';
import { individualProgramData, programStatusLabels } from './individual-program-data';
import { ProgramEditor } from './ProgramEditor';
import './individual-program.css';

type Props = {
  student: Student;
  records: Record<RecordKind, Entry[]>;
  navigation: ReactNode;
  onLesson: (entry: Entry) => void;
  onSchedule: () => void;
  onResult: (entry: Entry) => void;
};
export function IndividualProgram({
  student,
  records,
  navigation,
  onLesson,
  onSchedule,
  onResult,
}: Props) {
  const [now, setNow] = useState(Date.now);
  const data = individualProgramData(student, records, now);
  const initialBlock = () =>
    data.blocks.find((block) => block.status === 'learning')?.id ||
    data.blocks.find((block) => block.status === 'planned')?.id ||
    data.blocks[0]?.id;
  const [expanded, setExpanded] = useState<string[]>(() =>
    [initialBlock()].filter((id): id is string => Boolean(id)),
  );
  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [materials, setMaterials] = useState<CurriculumTopic | null>(null);
  const blockIds = data.blocks.map((block) => block.id).join(',');
  useEffect(() => {
    setExpanded((old) => {
      const remaining = old.filter((id) => data.blocks.some((block) => block.id === id));
      return remaining.length
        ? remaining
        : [initialBlock()].filter((id): id is string => Boolean(id));
    });
  }, [blockIds]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('print');
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    const change = () => flushSync(() => setPrinting(media.matches));
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    media.addEventListener('change', change);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      media.removeEventListener('change', change);
    };
  }, []);
  const mode = [
    student.curriculum?.lessonsPerWeek
      ? `${student.curriculum.lessonsPerWeek} ${student.curriculum.lessonsPerWeek === 1 ? 'занятие' : student.curriculum.lessonsPerWeek < 5 ? 'занятия' : 'занятий'} в неделю`
      : '',
    student.curriculum?.duration ? `по ${student.curriculum.duration} минут` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="individual-program">
      <div className="ip-screen">
        <div className="ip-heading">
          <div>
            <h1>Индивидуальная программа</h1>
            <p>{[student.name, student.grade, student.subject].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="ip-heading-actions">
            <Button
              variant="secondary"
              title="Печать или сохранение программы в PDF"
              onClick={() => window.print()}
            >
              <Upload size={23} />
              Экспорт
            </Button>
            <Button onClick={() => setEditing(true)}>
              <Pencil size={22} />
              Редактировать программу
            </Button>
          </div>
        </div>
        <section className="ip-goal" aria-label="Цель обучения">
          <span className="ip-target">
            <Target size={44} />
          </span>
          <div className="ip-goal-copy">
            <p>Цель обучения</p>
            <h2>{student.goal || 'Определите цель обучения'}</h2>
            <div className="ip-goal-meta">
              <span>
                <CalendarDays size={22} />
                {mode || 'Режим занятий пока не указан'}
              </span>
              <span>
                <ChartNoAxesColumnIncreasing size={24} />
                Программа корректируется по результатам работы
              </span>
            </div>
          </div>
          <svg className="ip-goal-book" viewBox="0 0 260 160" aria-hidden="true">
            <path fill="#bbaaFF" d="M5 30Q0 12 25 18L105 47Q132 57 142 158L55 120Q30 111 22 88Z" />
            <path
              fill="#d4ff58"
              d="M142 158Q137 73 160 50L241 0Q260-3 260 20L255 80Q252 106 226 119Z"
            />
          </svg>
        </section>
        {navigation}
        <div
          role="tabpanel"
          id="sp-tab-panel"
          aria-labelledby="sp-tab-program"
          className="ip-layout"
        >
          <section className="ip-blocks" aria-label="Разделы программы">
            {data.blocks.length ? (
              data.blocks.map((block, index) => {
                const open = expanded.includes(block.id);
                return (
                  <article className={`ip-block ${block.status}`} key={block.id}>
                    <button
                      className="ip-block-heading"
                      aria-expanded={open}
                      aria-controls={`ip-topics-${block.id}`}
                      onClick={() =>
                        setExpanded(
                          open ? expanded.filter((id) => id !== block.id) : [...expanded, block.id],
                        )
                      }
                    >
                      <span className="ip-block-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="ip-block-title">
                        <strong>{block.title}</strong>
                        <small>
                          {block.topics.length
                            ? `${block.mastered} из ${block.topics.length} тем освоены`
                            : 'Запланировано'}
                        </small>
                      </span>
                      {block.status === 'mastered' && (
                        <span className="ip-block-done">
                          <Check size={22} />
                        </span>
                      )}
                      {open ? <ChevronUp size={23} /> : <ChevronDown size={23} />}
                    </button>
                    <div id={`ip-topics-${block.id}`} hidden={!open} className="ip-topics">
                      {block.topics.map((topic, position) => (
                        <div className={`ip-topic ${topic.status}`} key={topic.id}>
                          <span className="ip-topic-number">
                            {index + 1}.{position + 1}
                          </span>
                          <span className="ip-topic-dot" aria-hidden="true">
                            {topic.status === 'mastered' && <Check size={14} />}
                          </span>
                          <span className="ip-topic-name">{topic.title}</span>
                          <span className={`ip-status ${topic.status}`}>
                            {programStatusLabels[topic.status]}
                          </span>
                          {topic.materialIds.length > 0 && (
                            <button
                              className="ip-material-link"
                              aria-label={`Открыть материалы: ${topic.title}`}
                              onClick={() => setMaterials(topic)}
                            >
                              Открыть материалы
                              <ArrowRight size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      {!block.topics.length && (
                        <p className="ip-block-empty">Темы этого раздела ещё не добавлены.</p>
                      )}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="ip-empty">
                <BookOpen size={40} />
                <h2>Составим маршрут обучения</h2>
                <p>Добавьте разделы и темы, чтобы видеть, что уже освоено и что изучаем сейчас.</p>
                <Button onClick={() => setEditing(true)}>
                  <Plus size={18} />
                  Составить программу
                </Button>
                {student.program && (
                  <div className="ip-legacy">
                    <h3>Текущая запись программы</h3>
                    <p>{student.program}</p>
                  </div>
                )}
              </div>
            )}
          </section>
          <aside className="ip-side">
            <section className="ip-panel" aria-label="На ближайшие уроки">
              <h2>На ближайшие уроки</h2>
              {data.lessons.length ? (
                <ol className="ip-next-list">
                  {data.lessons.map((lesson, index) => (
                    <li key={lesson.id}>
                      <span className={`ip-next-number ${index === 0 ? 'first' : ''}`}>
                        {index + 1}
                      </span>
                      <button className="ip-next-content" onClick={() => onLesson(lesson)}>
                        <strong>{lesson.data.title}</strong>
                        {lesson.data.notes && <p>{lesson.data.notes}</p>}
                        <small>
                          <BookOpen size={19} />
                          <span>
                            {lesson.data.duration} минут ·{' '}
                            {date(lesson.data.start, { year: 'numeric' })} ·{' '}
                            {localInput(lesson.data.start).slice(11, 16)} МСК
                          </span>
                        </small>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="ip-side-empty">
                  <p>Ближайших занятий пока нет.</p>
                  <button onClick={onSchedule}>
                    <Plus size={17} />
                    Запланировать урок
                  </button>
                </div>
              )}
            </section>
            <section className="ip-panel ip-repeat" aria-label="Повторить">
              <h2>Повторить</h2>
              {data.repeat.length ? (
                data.repeat.map((entry) => (
                  <button className="ip-repeat-item" key={entry.id} onClick={() => onResult(entry)}>
                    <span className="ip-repeat-icon">
                      <FileText size={29} />
                    </span>
                    <span>
                      <strong>{entry.data.topic}</strong>
                      <p>{entry.data.recommendation || 'Вернёмся к теме и проверим понимание.'}</p>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                ))
              ) : (
                <p className="ip-repeat-empty">
                  По последним результатам нет тем с отметкой «Повторить».
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
      {printing && (
        <article className="ip-print">
          <Brand />
          <h1>Индивидуальная программа</h1>
          <p>{[student.name, student.grade, student.subject].filter(Boolean).join(' · ')}</p>
          <h2>Цель обучения</h2>
          <p>{student.goal || 'Пока не указана'}</p>
          {mode && <p>{mode}</p>}
          {data.blocks.length ? (
            data.blocks.map((block, index) => (
              <section key={block.id}>
                <h2>
                  {index + 1}. {block.title}
                </h2>
                <p>
                  {block.topics.length
                    ? `${block.mastered} из ${block.topics.length} тем освоены`
                    : 'Запланировано · темы ещё не добавлены'}
                </p>
                {block.topics.length > 0 && (
                  <ul>
                    {block.topics.map((topic) => (
                      <li key={topic.id}>
                        <span>{topic.title}</span>
                        <strong>{programStatusLabels[topic.status]}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          ) : (
            <p className="ip-print-text">
              {student.program || 'Разделы и темы пока не добавлены.'}
            </p>
          )}
        </article>
      )}
      {editing && (
        <ProgramEditor
          student={student}
          materials={records.material}
          onClose={() => setEditing(false)}
        />
      )}
      {materials && (
        <Modal title={`Материалы: ${materials.title}`} onClose={() => setMaterials(null)} wide>
          <div className="ip-materials">
            {materials.materialIds.map((id) => {
              const item = records.material.find((entry) => entry.id === id);
              return item ? (
                <article key={id}>
                  <h3>
                    <FolderOpen size={21} />
                    {item.data.title}
                  </h3>
                  {item.data.description && <p>{item.data.description}</p>}
                  {item.data.fileIds?.length ? (
                    <FileLinks ids={item.data.fileIds} />
                  ) : (
                    <p className="muted">Файлы пока не прикреплены.</p>
                  )}
                </article>
              ) : (
                <p key={id}>
                  Один из материалов больше недоступен. Его можно убрать в редакторе программы.
                </p>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
