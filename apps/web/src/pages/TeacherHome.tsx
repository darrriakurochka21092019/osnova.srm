import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderOpen,
  GraduationCap,
  MoreVertical,
  PanelsTopLeft,
  Play,
  Plus,
  ListTodo,
} from 'lucide-react';
import { api, date, localInput } from '../api';
import { useApp } from '../store';
import { Avatar, Button, FileLinks, Modal } from '../ui';
import { BoardCreate, EntryEditor } from './editors';
import { LessonDialog } from './workspace';
import type { Entry, RecordKind } from '../../../../packages/contracts';

type Editor = { kind: RecordKind; entry?: Entry } | null;
const time = (value: string | Date) =>
  date(value, { hour: '2-digit', minute: '2-digit', day: undefined, month: undefined });
const shortDate = (value: string | Date) => date(value, { day: '2-digit', month: '2-digit' });
const countLabel = (n: number, forms: [string, string, string]) =>
  forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2];

export function TeacherHome() {
  const { records, students, classrooms, studentName, toast } = useApp();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [editor, setEditor] = useState<Editor>(null);
  const [prepare, setPrepare] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Entry | null>(null);
  const [material, setMaterial] = useState<Entry | null>(null);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const day = localInput(new Date(now)).slice(0, 10);
  const today = records.lesson
    .filter((r) => localInput(r.data.start).startsWith(day))
    .sort((a, b) => Date.parse(a.data.start) - Date.parse(b.data.start));
  const next = records.lesson
    .filter(
      (r) =>
        ['planned', 'rescheduled', 'live'].includes(r.data.status) &&
        (r.data.status === 'live' || Date.parse(r.data.start) + r.data.duration * 60000 > now),
    )
    .sort(
      (a, b) =>
        Number(b.data.status === 'live') - Number(a.data.status === 'live') ||
        Date.parse(a.data.start) - Date.parse(b.data.start),
    )[0];
  const pending = records.homework.filter((r) => r.data.status === 'submitted');
  const tasks = records.task
    .filter((r) => !r.data.done)
    .sort(
      (a, b) =>
        (a.data.due ? Date.parse(a.data.due) : Infinity) -
        (b.data.due ? Date.parse(b.data.due) : Infinity),
    );
  const recent = [...records.material]
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, 3);
  const nextStudent = students.find((s) => s.id === next?.student_id);
  const nextRoom = classrooms.find((r) => r.id === next?.data.classroomId);
  const groupSize = next
    ? new Set([next.student_id, ...(next.data.studentIds || [])].filter(Boolean)).size
    : 0;
  const group = groupSize > 1 || nextRoom?.kind === 'group';
  const nextPerson = next
    ? group
      ? nextRoom?.title || 'Мини-группа'
      : nextStudent?.name || studentName(next.student_id)
    : '';
  const nextSubject = next?.data.subject || nextStudent?.subject;
  const until = next ? Math.max(0, Math.ceil((Date.parse(next.data.start) - now) / 60000)) : 0;
  const nextLabel =
    next?.data.status === 'live'
      ? 'Урок уже идёт'
      : !until
        ? 'Можно начинать'
        : until < 60
          ? `через ${until} мин`
          : until < 1440
            ? `через ${Math.floor(until / 60)} ч${until % 60 ? ` ${until % 60} мин` : ''}`
            : shortDate(next!.data.start);
  const openLesson = async (entry: Entry, preparation = false) => {
    setOpening(true);
    try {
      const room = await api(`/lessons/${entry.id}/classroom`, {});
      navigate(`/lesson/${room.id}${preparation ? '/prepare' : ''}?lesson=${entry.id}`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setOpening(false);
    }
  };
  const stats = [
    {
      n: today.filter((r) => r.data.status !== 'cancelled').length,
      forms: ['урок сегодня', 'урока сегодня', 'уроков сегодня'],
      icon: GraduationCap,
      tone: 'purple',
      to: '/schedule',
    },
    {
      n: pending.length,
      forms: ['работа на проверку', 'работы на проверку', 'работ на проверку'],
      icon: FileText,
      tone: 'peach',
      to: '/homework',
    },
    {
      n: tasks.length,
      forms: ['важное дело', 'важных дела', 'важных дел'],
      icon: CircleCheck,
      tone: 'mint',
      to: '/tasks',
    },
  ];
  return (
    <div className="teacher-home">
      <header className="home-heading">
        <h1>Хорошего дня!</h1>
        <p>{date(new Date(now), { weekday: 'long', year: 'numeric' })} · МСК</p>
      </header>
      <div className="home-stats">
        {stats.map(({ n, forms, icon: Icon, tone, to }) => (
          <Link to={to} className="home-stat" key={to}>
            <span className={`round-icon ${tone}`}>
              <Icon size={27} />
            </span>
            <div>
              <strong>{n}</strong>
              <span>{countLabel(n, forms as [string, string, string])}</span>
            </div>
          </Link>
        ))}
      </div>
      <div className="home-grid">
        <section className="home-hero" aria-label="Ближайший урок">
          <div className="home-hero-copy">
            <span className="home-next-label">
              <i />
              {next ? `Ближайший урок · ${nextLabel}` : 'Всё для вашего следующего урока'}
            </span>
            <h2>
              {next
                ? [
                    nextPerson,
                    [
                      nextSubject,
                      group
                        ? `${groupSize || nextRoom?.students.length} ${countLabel(groupSize || nextRoom?.students.length || 0, ['ученик', 'ученика', 'учеников'])}`
                        : nextStudent?.grade,
                    ]
                      .filter(Boolean)
                      .join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Место, где становится понятно'}
            </h2>
            {next ? (
              <div className="home-hero-meta">
                <span>
                  <Clock3 size={20} />
                  {localInput(next.data.start).slice(0, 10) !== day &&
                    `${shortDate(next.data.start)} · `}
                  {time(next.data.start)}–
                  {time(new Date(Date.parse(next.data.start) + next.data.duration * 60000))} МСК
                </span>
                <span>
                  <BookOpen size={20} />
                  {next.data.title}
                </span>
              </div>
            ) : (
              <p>
                Подготовьте материалы на общей доске ученика.
                <br />
                Они сохранятся между занятиями.
              </p>
            )}
            <div className="home-hero-actions">
              {next ? (
                <>
                  <Button
                    className="home-start"
                    disabled={opening}
                    onClick={() => void openLesson(next)}
                  >
                    <Play size={20} />
                    {next.data.status === 'live' ? 'Продолжить урок' : 'Начать урок'}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={opening}
                    onClick={() => void openLesson(next, true)}
                  >
                    <FileText size={19} />
                    Открыть подготовку
                  </Button>
                </>
              ) : students.length ? (
                <>
                  <Button className="home-start" onClick={() => setEditor({ kind: 'lesson' })}>
                    <Plus size={20} />
                    Запланировать урок
                  </Button>
                  <Button variant="secondary" onClick={() => setPrepare(true)}>
                    Открыть подготовку
                  </Button>
                </>
              ) : (
                <Link className="btn btn-primary home-start" to="/students">
                  <Plus size={20} />
                  Добавить ученика
                </Link>
              )}
            </div>
          </div>
        </section>
        <section className="home-panel home-attention">
          <HomeHeading title="Нужно внимание" to="/tasks" link="Все дела" />
          {pending.length > 0 && (
            <Link to="/homework" className="home-attention-row">
              <span className="round-icon peach">
                <ClipboardCheck size={24} />
              </span>
              <div>
                <strong>
                  Проверить {pending.length}{' '}
                  {countLabel(pending.length, ['работу', 'работы', 'работ'])}
                </strong>
                <small>Ученики ждут обратную связь</small>
              </div>
              <span className="home-count peach">{pending.length}</span>
              <ArrowRight size={16} />
            </Link>
          )}
          {tasks.slice(0, pending.length ? 2 : 3).map((task) => (
            <Link to="/tasks" key={task.id} className="home-attention-row">
              <span
                className={`round-icon ${task.data.due && Date.parse(task.data.due) < now ? 'peach' : 'purple'}`}
              >
                <ListTodo size={24} />
              </span>
              <div>
                <strong>{task.data.title}</strong>
                <small>
                  {task.data.due ? `Срок ${shortDate(task.data.due)}` : 'Запланированное дело'}
                </small>
              </div>
              {task.data.due && (
                <span
                  className={`home-count ${Date.parse(task.data.due) < now ? 'peach' : 'purple'}`}
                >
                  {Date.parse(task.data.due) < now
                    ? 'Просрочено'
                    : `До ${shortDate(task.data.due)}`}
                </span>
              )}
              <ArrowRight size={16} />
            </Link>
          ))}
          {!pending.length && !tasks.length && (
            <div className="home-calm">
              <span className="round-icon mint">
                <Check size={28} />
              </span>
              <strong>Всё под контролем</strong>
              <p>Новых работ на проверке и незавершённых дел пока нет.</p>
              <Link className="text-link" to="/tasks">
                Добавить задачу <Plus size={15} />
              </Link>
            </div>
          )}
        </section>
        <section className="home-panel home-today">
          <HomeHeading title="Сегодняшние занятия" to="/schedule" link="Перейти к расписанию" />
          {today.length ? (
            <div className="home-lessons">
              {today.map((entry) => {
                const person = students.find((s) => s.id === entry.student_id);
                const room = classrooms.find((r) => r.id === entry.data.classroomId);
                const size = new Set(
                  [entry.student_id, ...(entry.data.studentIds || [])].filter(Boolean),
                ).size;
                const isGroup = size > 1 || room?.kind === 'group';
                const name = isGroup
                  ? room?.title || 'Мини-группа'
                  : person?.name || studentName(entry.student_id);
                return (
                  <div className={`home-lesson ${entry.data.status}`} key={entry.id}>
                    <i className="home-lesson-dot" />
                    <div className="home-time">
                      <strong>{time(entry.data.start)}</strong>
                      <small>
                        {entry.data.duration >= 60
                          ? `${Math.floor(entry.data.duration / 60)} ч `
                          : ''}
                        {entry.data.duration % 60
                          ? `${entry.data.duration % 60} мин`
                          : entry.data.duration >= 60
                            ? '00 мин'
                            : ''}
                      </small>
                    </div>
                    <Avatar name={name} color={person?.color || 'purple'} />
                    <div className="home-person">
                      <strong>{name}</strong>
                      <small>
                        {isGroup
                          ? `${size || room?.students.length} ${countLabel(size || room?.students.length || 0, ['участник', 'участника', 'участников'])}`
                          : person?.grade || 'Индивидуально'}
                      </small>
                    </div>
                    <button className="home-lesson-topic" onClick={() => setSelectedLesson(entry)}>
                      <strong>{entry.data.title}</strong>
                      <small>
                        {entry.data.status === 'cancelled'
                          ? 'Занятие отменено'
                          : entry.data.status === 'completed'
                            ? 'Занятие завершено'
                            : entry.data.subject || person?.subject || 'Занятие'}
                      </small>
                    </button>
                    <Button
                      variant="secondary"
                      className="home-open-lesson"
                      disabled={opening}
                      onClick={() =>
                        entry.data.status === 'completed' || entry.data.status === 'cancelled'
                          ? setSelectedLesson(entry)
                          : void openLesson(entry)
                      }
                      aria-label={`Открыть урок: ${entry.data.title}`}
                    >
                      <FileText size={17} />
                      <span>{entry.data.status === 'completed' ? 'Итоги' : 'Открыть'}</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="home-empty-schedule">
              <CalendarDays size={28} />
              <h3>Сегодня без запланированных занятий</h3>
              <p>Можно подготовить материалы или оставить время для себя.</p>
              {students.length ? (
                <Button variant="secondary" onClick={() => setEditor({ kind: 'lesson' })}>
                  <Plus size={16} />
                  Запланировать урок
                </Button>
              ) : (
                <Link className="text-link" to="/students">
                  Добавить первого ученика <ArrowRight size={15} />
                </Link>
              )}
            </div>
          )}
        </section>
        <section className="home-panel home-actions">
          <HomeHeading title="Быстрые действия" />
          <button className="home-quick purple" onClick={() => students.length ? setPrepare(true) : navigate('/students')}>
            <span className="round-icon">
              <PanelsTopLeft size={25} />
            </span>
            <span>
              <strong>Подготовить урок</strong>
              <small>{students.length ? 'Открыть общую доску ученика' : 'Сначала добавьте ученика'}</small>
            </span>
            <ArrowRight size={18} />
          </button>
          <button className="home-quick mint" onClick={() => students.length ? setEditor({ kind: 'homework' }) : navigate('/students')}>
            <span className="round-icon">
              <FileText size={25} />
            </span>
            <span>
              <strong>Назначить задание</strong>
              <small>Выбрать ученика и срок</small>
            </span>
            <ArrowRight size={18} />
          </button>
          <button className="home-quick peach" onClick={() => setEditor({ kind: 'material' })}>
            <span className="round-icon">
              <FolderOpen size={25} />
            </span>
            <span>
              <strong>Загрузить материал</strong>
              <small>Добавить файл в библиотеку</small>
            </span>
            <ArrowRight size={18} />
          </button>
        </section>
        <section className="home-panel home-materials">
          <HomeHeading title="Последние материалы" to="/materials" link="Все материалы" />
          {recent.length ? (
            <div className="home-material-grid">
              {recent.map((entry, i) => (
                <article className="home-material" key={entry.id}>
                  <button className="home-material-open" onClick={() => setMaterial(entry)}>
                    <span className={`home-file-icon ${['peach', 'blue', 'mint'][i]}`}>
                      <FileText size={25} />
                    </span>
                    <span>
                      <strong>{entry.data.title}</strong>
                      <small>
                        {entry.data.fileIds?.length
                          ? `${entry.data.fileIds.length} ${countLabel(entry.data.fileIds.length, ['файл', 'файла', 'файлов'])}`
                          : 'Заметка'}{' '}
                        · {shortDate(entry.updated_at)}
                      </small>
                    </span>
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Редактировать материал: ${entry.data.title}`}
                    onClick={() => setEditor({ kind: 'material', entry })}
                  >
                    <MoreVertical size={19} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="home-material-empty">
              <FolderOpen size={23} />
              <span>Здесь появятся конспекты, презентации и рабочие листы.</span>
              <button className="text-link" onClick={() => setEditor({ kind: 'material' })}>
                Добавить материал <Plus size={15} />
              </button>
            </div>
          )}
        </section>
      </div>
      {editor && (
        <EntryEditor kind={editor.kind} entry={editor.entry} onClose={() => setEditor(null)} />
      )}
      {prepare && <BoardCreate onClose={() => setPrepare(false)} />}
      {selectedLesson && (
        <LessonDialog entry={selectedLesson} onClose={() => setSelectedLesson(null)} />
      )}
      {material && (
        <Modal title={material.data.title} onClose={() => setMaterial(null)}>
          <p className="muted">
            {material.data.folder} · {date(material.updated_at)}
          </p>
          <p className="pre-wrap">{material.data.description || 'Учебный материал'}</p>
          <FileLinks ids={material.data.fileIds} />
          <div className="form-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setEditor({ kind: 'material', entry: material });
                setMaterial(null);
              }}
            >
              Изменить материал
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function HomeHeading({ title, to, link }: { title: string; to?: string; link?: string }) {
  return (
    <div className="home-section-heading">
      <h2>{title}</h2>
      {to && (
        <Link to={to}>
          {link}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
