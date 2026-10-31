import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  PanelsTopLeft,
  CalendarDays,
  Clock3,
  Users,
  ClipboardCheck,
  MoreHorizontal,
  Pencil,
  Archive,
  ChevronLeft,
  Play,
  Sparkles,
  Check,
  FileText,
  Mail,
  Target,
  FolderOpen,
  X,
  Copy,
} from 'lucide-react';
import { api, date, localInput, money, statusLabels, todayKey } from '../api';
import { useApp } from '../store';
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  Empty,
  Field,
  FormError,
  Modal,
  PageHead,
  SearchBox,
} from '../ui';
import { BoardCreate, EntryEditor, InviteDialog, StudentEditor, StudentSelect } from './editors';
import type { Board, Classroom, Entry } from '../../../../packages/contracts';

export function Dashboard() {
  const { user, records, students, boards, classrooms, toast } = useApp(),
    [createBoard, setCreateBoard] = useState(false),
    [lesson, setLesson] = useState<Entry | null>(null);
  const navigate = useNavigate();
  const enterLesson = async (entry: Entry) => {
    try {
      const room = await api(`/lessons/${entry.id}/classroom`, {});
      navigate(`/lesson/${room.id}?lesson=${entry.id}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const teacher = user.role === 'teacher',
    now = Date.now();
  const upcoming = records.lesson
    .filter(
      (r) =>
        ['planned', 'rescheduled', 'live'].includes(r.data.status) &&
        (r.data.status === 'live' || new Date(r.data.start).getTime() >= now - 4 * 3600000),
    )
    .sort(
      (a, b) =>
        Number(b.data.status === 'live') - Number(a.data.status === 'live') ||
        a.data.start.localeCompare(b.data.start),
    );
  const today = upcoming.filter((r) => localInput(r.data.start).startsWith(todayKey()));
  const pending = records.homework.filter((r) =>
    teacher ? r.data.status === 'submitted' : ['assigned', 'draft'].includes(r.data.status),
  );
  const next = upcoming[0];
  return (
    <>
      <PageHead
        eyebrow={date(new Date(), { weekday: 'long', year: 'numeric' }).toUpperCase()}
        title={`${teacher ? 'Хорошего дня' : 'Привет'}, ${user.name.split(' ')[0]}!`}
        description={
          teacher
            ? 'Для каждого хорошего урока нужна основа. Всё остальное уже здесь.'
            : 'Давайте сделаем ещё один шаг к вашей цели.'
        }
        action={
          teacher ? (
            <Button onClick={() => setCreateBoard(true)}>
              <Plus size={18} />
              Запланировать урок
            </Button>
          ) : (
            <Link className="btn btn-primary" to="/homework">
              Мои задания
              <ArrowRight size={17} />
            </Link>
          )
        }
      />
      <div className="stats-grid">
        <Stat label="Занятий сегодня" value={today.length} icon={CalendarDays} tone="purple" />
        <Stat
          label={teacher ? 'Активных учеников' : 'Учебных комнат'}
          value={teacher ? students.filter((s) => s.status === 'active').length : classrooms.length}
          icon={Users}
          tone="mint"
        />
        <Stat
          label={teacher ? 'Работ на проверке' : 'Заданий к выполнению'}
          value={pending.length}
          icon={ClipboardCheck}
          tone="peach"
        />
        <Stat
          label="Учебных материалов"
          value={records.material.length}
          icon={FolderOpen}
          tone="blue"
        />
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="next-lesson-card">
            <div className="hero-copy">
              <span className="eyebrow">
                {next ? 'БЛИЖАЙШИЙ УРОК' : 'ВАШЕ УЧЕБНОЕ ПРОСТРАНСТВО'}
              </span>
              <h2>
                {next
                  ? next.data.title
                  : teacher
                    ? 'Место, где рождается понимание'
                    : 'Всё получится. Шаг за шагом.'}
              </h2>
              <p>
                {next
                  ? `${date(next.data.start, { hour: '2-digit', minute: '2-digit' })} · ${next.data.duration} минут`
                  : 'Пишите, объясняйте и исследуйте вместе на одной доске.'}
              </p>
              {next ? (
                <Button onClick={() => void enterLesson(next)}>
                  {next.data.status === 'live'
                    ? 'Продолжить урок'
                    : teacher
                      ? 'Начать урок'
                      : 'Войти на урок'}
                  <ArrowRight size={18} />
                </Button>
              ) : teacher ? (
                <Link className="btn btn-primary" to={students.length ? '/lessons' : '/students'}>
                  {students.length ? 'Подготовить урок' : 'Добавить ученика'}
                  <ArrowRight size={17} />
                </Link>
              ) : (
                <Link to="/lessons" className="btn btn-primary">
                  Моя учебная комната
                  <ArrowRight size={17} />
                </Link>
              )}
            </div>
            <div className="hero-graphic" aria-hidden="true">
              <div className="graphic-paper">
                <i />
                <i />
                <i />
                <span>Аа</span>
                <div className="graphic-stroke" />
              </div>
              <span className="graphic-bubble">
                <Sparkles size={24} />
              </span>
              <div className="graphic-circle" />
            </div>
          </section>
          <section className="panel">
            <SectionHeading
              title="План на сегодня"
              subtitle={`${date(new Date(), { weekday: 'long' })} · московское время`}
              to="/schedule"
            />
            <div className="lesson-list">
              {today.length ? (
                today.map((r, i) => (
                  <LessonRow key={r.id} entry={r} onClick={() => setLesson(r)} index={i} />
                ))
              ) : (
                <Empty
                  icon={CalendarDays}
                  title="День без запланированных уроков"
                  text={
                    teacher
                      ? 'Можно подготовить материалы или добавить занятие в расписание.'
                      : 'Отличное время повторить материал и выполнить задания.'
                  }
                />
              )}
            </div>
          </section>
          <section>
            <SectionHeading title="Учебные комнаты" to="/lessons" />
            <div className="board-grid compact">
              {boards
                .filter((b) => !b.archived && classrooms.some((c) => c.board_id === b.id))
                .slice(0, 3)
                .map((b, i) => (
                  <BoardCard key={b.id} board={b} index={i} />
                ))}
              {!classrooms.length && (
                <Link className="new-board-card" to={teacher ? '/students' : '/lessons'}>
                  <Plus size={25} />
                  <strong>
                    {teacher ? 'Добавьте первого ученика' : 'Ваша комната появится здесь'}
                  </strong>
                  <small>
                    {teacher
                      ? 'Комната с доской создастся автоматически'
                      : 'Откройте ссылку преподавателя'}
                  </small>
                </Link>
              )}
            </div>
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="panel">
            <SectionHeading title={teacher ? 'Ждут внимания' : 'Мои задания'} to="/homework" />
            {pending.length ? (
              pending.slice(0, 4).map((r) => (
                <Link className="assignment-mini" key={r.id} to={`/homework/${r.id}`}>
                  <span className="round-icon peach">
                    <ClipboardCheck size={18} />
                  </span>
                  <div>
                    <strong>{r.data.title}</strong>
                    <small>{teacher ? 'Пора проверить' : `До ${date(r.data.due)}`}</small>
                  </div>
                  <ArrowUpRight size={16} />
                </Link>
              ))
            ) : (
              <div className="mini-empty">
                <span className="round-icon mint">
                  <Check size={22} />
                </span>
                <h3>Всё под контролем</h3>
                <p className="muted">
                  {teacher ? 'Новых работ на проверке пока нет.' : 'Актуальных заданий пока нет.'}
                </p>
              </div>
            )}
          </section>
          <section className="panel">
            <SectionHeading
              title={teacher ? 'Мои задачи' : 'Последние события'}
              to={teacher ? '/tasks' : '/notifications'}
            />
            {teacher
              ? records.task
                  .filter((t) => !t.data.done)
                  .slice(0, 4)
                  .map((t) => (
                    <Link className="task-mini" key={t.id} to="/tasks">
                      <span className="task-check" />
                      <div>
                        <strong>{t.data.title}</strong>
                        {t.data.due && <small>{date(t.data.due)}</small>}
                      </div>
                    </Link>
                  ))
              : records.notification.slice(0, 3).map((n) => (
                  <Link to={n.data.path} className="task-mini" key={n.id}>
                    <BellDot />
                    <div>
                      <strong>{n.data.title}</strong>
                      <small>{n.data.message}</small>
                    </div>
                  </Link>
                ))}
            {(teacher
              ? !records.task.filter((t) => !t.data.done).length
              : !records.notification.length) && (
              <p className="muted empty-note">
                {teacher
                  ? 'Добавьте дело, чтобы не держать всё в голове.'
                  : 'Здесь появятся новости об уроках и заданиях.'}
              </p>
            )}
          </section>
          <div className="tip-card">
            <span className="eyebrow">МАЛЕНЬКИЙ СОВЕТ</span>
            <h3>
              Одна доска.
              <br />
              Много открытий.
            </h3>
            <p>Загрузите рабочий лист в PDF и делайте пометки прямо на его страницах.</p>
            <Link to="/help">
              Как это работает
              <ArrowUpRight size={16} />
            </Link>
            <span className="tip-symbol">✳</span>
          </div>
        </aside>
      </div>
      {createBoard && <EntryEditor kind="lesson" onClose={() => setCreateBoard(false)} />}{' '}
      {lesson && <LessonDialog entry={lesson} onClose={() => setLesson(null)} />}
    </>
  );
}
function BellDot() {
  return <span className="activity-dot" />;
}
function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: any;
  tone: string;
}) {
  return (
    <div className="stat-card">
      <div>
        <span className="muted">{label}</span>
        <strong>{value.toString().padStart(2, '0')}</strong>
      </div>
      <span className={`round-icon ${tone}`}>
        <Icon size={22} />
      </span>
    </div>
  );
}
export function SectionHeading({
  title,
  subtitle,
  to,
}: {
  title: string;
  subtitle?: string;
  to?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <small className="muted">{subtitle}</small>}
      </div>
      {to && (
        <Link className="text-link" to={to}>
          Все
          <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function BoardCard({
  board,
  index = 0,
  actions,
}: {
  board: Board;
  index?: number;
  actions?: React.ReactNode;
}) {
  const { studentName, classrooms, user } = useApp();
  const room = classrooms.find((c) => c.board_id === board.id),
    target = room ? `/lesson/${room.id}` : `/board/${board.id}`;
  return (
    <div className="board-card">
      <Link to={target} className={`board-preview preview-${index % 4}`}>
        <div className="preview-label">
          {room
            ? room.kind === 'group'
              ? 'Мини-группа'
              : 'Индивидуальные занятия'
            : 'Учебный материал'}
        </div>
        <div className="preview-text">{(room?.title || board.title).slice(0, 55)}</div>
        <div className="preview-lines">
          <i />
          <i />
          <i />
        </div>
        <span className="preview-arrow">↗</span>
      </Link>
      <div className="board-info">
        <Link to={target}>
          <h3>{room?.title || board.title}</h3>
          <p>{board.student_id ? studentName(board.student_id) : 'Моё пространство'}</p>
          <small className="muted">
            {room ? 'Постоянная комната · одна ссылка' : `${date(board.updated_at)} · Общий холст`}
          </small>
        </Link>
        {actions}
      </div>
    </div>
  );
}
export function BoardsPage() {
  const { user, boards: allBoards, classrooms, students, refresh, toast } = useApp();
  const boards = allBoards.filter((b) => !classrooms.some((c) => c.board_id === b.id));
  const [create, setCreate] = useState(false),
    [query, setQuery] = useState(''),
    [tab, setTab] = useState('active'),
    [sid, setSid] = useState(''),
    [archive, setArchive] = useState<Board | null>(null);
  const list = boards.filter(
    (b) =>
      b.archived === (tab === 'archived') &&
      b.title.toLowerCase().includes(query.toLowerCase()) &&
      (!sid || b.student_id === sid),
  );
  return (
    <>
      <PageHead
        eyebrow="ПРОСТРАНСТВО ДЛЯ ОБЪЯСНЕНИЙ"
        title="Материалы и прежние доски"
        description="Сохранённые материалы остаются доступны. Для подготовки нового занятия откройте учебную комнату ученика."
        action={
          user.role === 'teacher' && (
            <Button onClick={() => setCreate(true)}>
              <Plus size={18} />
              Подготовить занятие
            </Button>
          )
        }
      />
      <div className="filter-bar">
        <div className="tabs">
          <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
            Активные<Badge>{boards.filter((b) => !b.archived).length}</Badge>
          </button>
          <button className={tab === 'archived' ? 'active' : ''} onClick={() => setTab('archived')}>
            Архив
          </button>
        </div>
        <div className="filter-actions">
          <SearchBox value={query} onChange={setQuery} placeholder="Найти доску…" />
          {user.role === 'teacher' && (
            <select
              aria-label="Фильтр по ученику"
              value={sid}
              onChange={(e) => setSid(e.target.value)}
            >
              <option value="">Все ученики</option>
              {students.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {list.length ? (
        <div className="board-grid">
          {list.map((b, i) => (
            <BoardCard
              board={b}
              index={i}
              key={b.id}
              actions={
                user.role === 'teacher' && (
                  <button
                    className="icon-btn"
                    aria-label={b.archived ? 'Вернуть из архива' : 'В архив'}
                    title={b.archived ? 'Вернуть из архива' : 'В архив'}
                    onClick={() => setArchive(b)}
                  >
                    <Archive size={17} />
                  </button>
                )
              }
            />
          ))}
        </div>
      ) : (
        <Empty
          icon={PanelsTopLeft}
          title={
            query
              ? 'Доска не найдена'
              : tab === 'archived'
                ? 'Архив пока пуст'
                : 'Всё начинается с чистого листа'
          }
          text="Доска сохраняет страницы, материалы и заметки урока."
          action={
            user.role === 'teacher' &&
            tab === 'active' && (
              <Button onClick={() => setCreate(true)}>
                <Plus size={16} />
                Создать доску
              </Button>
            )
          }
        />
      )}{' '}
      {create && <BoardCreate onClose={() => setCreate(false)} />}{' '}
      {archive && (
        <Confirm
          title={archive.archived ? 'Вернуть доску?' : 'Переместить в архив?'}
          text={
            archive.archived
              ? 'Участники снова смогут редактировать доску.'
              : 'Материалы останутся сохранены. Редактирование закроется до возвращения из архива.'
          }
          onClose={() => setArchive(null)}
          onConfirm={async () => {
            await api(`/boards/${archive.id}`, { archived: !archive.archived }, 'PATCH');
            await refresh();
            toast('Готово');
          }}
        />
      )}
    </>
  );
}
export function StudentDetail() {
  const { id } = useParams(),
    { students, records, boards, classrooms, toast } = useApp();
  const navigate = useNavigate();
  const s = students.find((x) => x.id === id);
  const [tab, setTab] = useState('overview'),
    [edit, setEdit] = useState(false),
    [invite, setInvite] = useState(''),
    [permalink, setPermalink] = useState(''),
    [openedLesson, setOpenedLesson] = useState<Entry | null>(null),
    [editor, setEditor] = useState<'lesson' | 'homework' | 'result' | 'notification' | null>(null);
  if (!s)
    return (
      <Empty title="Ученик не найден" action={<Link to="/students">К списку учеников</Link>} />
    );
  const lessons = records.lesson.filter(
      (r) => r.student_id === id || r.data.studentIds?.includes(id),
    ),
    homework = records.homework.filter((r) => r.student_id === id),
    results = records.result.filter((r) => r.student_id === id);
  const room = classrooms.find(
    (r) => r.kind === 'individual' && r.students.some((member) => member.id === s.id),
  );
  const openRoom = async (prepare = false) => {
    try {
      const r = room || (await api<Classroom>('/classrooms', { studentIds: [s.id] }));
      navigate(`/lesson/${r.id}${prepare ? '/prepare' : ''}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <>
      <Link className="text-link back-link" to="/students">
        <ChevronLeft size={16} />
        Все ученики
      </Link>
      <div className="student-detail-head">
        <Avatar name={s.name} color={s.color} />
        <div>
          <h1>{s.name}</h1>
          <p className="muted">
            {s.grade} · <span>{statusLabels[s.status]}</span>
          </p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={() => setEdit(true)}>
            <Pencil size={16} />
            Карточка
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const r = room || (await api<Classroom>('/classrooms', { studentIds: [s.id] }));
                setPermalink(r.link || '');
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            <Copy size={16} />
            Ссылка на занятия
          </Button>
          <Button disabled={s.status === 'paused'} onClick={() => void openRoom()}>
            <Play size={17} />
            Начать урок
          </Button>
        </div>
      </div>
      <section className="student-classroom-card">
        <div>
          <span className="eyebrow">ПОСТОЯННАЯ УЧЕБНАЯ КОМНАТА</span>
          <h2>
            {room?.activeSession?.title ||
              room?.lesson?.data.title ||
              'Всё готово к вашим занятиям'}
          </h2>
          <p>
            {room?.lesson
              ? `${date(room.lesson.data.start, { hour: '2-digit', minute: '2-digit' })} МСК · ${room.lesson.data.duration} минут`
              : 'Одна доска и одна ссылка для всех уроков этого ученика.'}
          </p>
          <div className="button-row">
            <Button variant="secondary" onClick={() => void openRoom(true)}>
              <PanelsTopLeft size={16} />
              Подготовить доску
            </Button>
            <button className="text-link" onClick={() => void openRoom()}>
              Войти на урок <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <span className="student-classroom-icon">
          <PanelsTopLeft size={43} />
        </span>
      </section>
      <div className="tabs page-tabs">
        {[
          ['overview', 'Обзор'],
          ['program', 'Программа'],
          ['lessons', 'Уроки'],
          ['homework', 'Задания'],
          ['results', 'Прогресс'],
          ['documents', 'Документы'],
        ].map(([v, n]) => (
          <button className={tab === v ? 'active' : ''} onClick={() => setTab(v)} key={v}>
            {n}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <div className="two-columns">
          <section className="panel">
            <span className="round-icon purple">
              <Target size={23} />
            </span>
            <h2>Учебная цель</h2>
            <p className="pre-wrap">{s.goal || 'Пока не определена'}</p>
            <Button variant="secondary" onClick={() => setEdit(true)}>
              Изменить цель
            </Button>
            <hr />
            <h3>Быстрые действия</h3>
            <div className="button-row">
              <Button variant="secondary" onClick={() => setEditor('lesson')}>
                Запланировать урок
              </Button>
              <Button variant="secondary" onClick={() => setEditor('homework')}>
                Назначить задание
              </Button>
              <Button variant="secondary" onClick={() => setEditor('notification')}>
                Уведомить ученика
              </Button>
            </div>
            <button
              className="text-link"
              style={{ marginTop: 18, fontSize: 11 }}
              onClick={async () => {
                try {
                  setInvite((await api(`/students/${s.id}/invite`, {})).url);
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              <Mail size={15} />
              Настроить вход в личный кабинет ученика
            </button>
          </section>
          <section className="panel">
            <SectionHeading title="Прежние материалы" />
            <div className="list-links">
              {boards
                .filter((b) => b.student_id === id && b.id !== room?.board_id)
                .map((b) => (
                  <Link key={b.id} to={`/board/${b.id}`}>
                    <PanelsTopLeft size={19} />
                    {b.title}
                    <ArrowUpRight size={17} />
                  </Link>
                ))}
              {!boards.filter((b) => b.student_id === id && b.id !== room?.board_id).length && (
                <p className="muted">Новые материалы сохраняются в учебной комнате ученика.</p>
              )}
            </div>
            <hr />
            <h3>Уже сделано</h3>
            <div className="inline-metrics">
              <span>
                <strong>{lessons.filter((l) => l.data.status === 'completed').length}</strong>уроков
              </span>
              <span>
                <strong>{homework.filter((h) => h.data.status === 'reviewed').length}</strong>работ
                проверено
              </span>
              <span>
                <strong>{results.filter((r) => r.data.skill === 'mastered').length}</strong>навыков
                освоено
              </span>
            </div>
          </section>
        </div>
      )}
      {tab === 'program' && (
        <section className="panel">
          <SectionHeading title="Индивидуальная программа" />
          <p className="pre-wrap program-text">
            {s.program || 'Добавьте последовательность тем и учебных блоков.'}
          </p>
          <Button onClick={() => setEdit(true)}>
            <Pencil size={16} />
            Редактировать программу
          </Button>
        </section>
      )}
      {tab === 'lessons' && (
        <section className="panel">
          <div className="section-heading">
            <h2>История и планы</h2>
            <Button onClick={() => setEditor('lesson')}>
              <Plus size={16} />
              Урок
            </Button>
          </div>
          {lessons.length ? (
            lessons
              .sort((a, b) => b.data.start.localeCompare(a.data.start))
              .map((r) => <LessonRow key={r.id} entry={r} onClick={() => setOpenedLesson(r)} />)
          ) : (
            <Empty icon={CalendarDays} title="Пока нет занятий" />
          )}
        </section>
      )}
      {tab === 'homework' && (
        <section className="panel">
          <div className="section-heading">
            <h2>Домашние задания</h2>
            <Button onClick={() => setEditor('homework')}>
              <Plus size={16} />
              Задание
            </Button>
          </div>
          <div className="list-links">
            {homework.map((h) => (
              <Link key={h.id} to={`/homework/${h.id}`}>
                <ClipboardCheck size={18} />
                {h.data.title}
                <Badge>{statusLabels[h.data.status]}</Badge>
              </Link>
            ))}
          </div>
          {!homework.length && <Empty title="Заданий пока нет" />}
        </section>
      )}
      {tab === 'results' && (
        <section className="panel">
          <div className="section-heading">
            <h2>Результаты работ</h2>
            <Button onClick={() => setEditor('result')}>
              <Plus size={16} />
              Результат
            </Button>
          </div>
          {results.map((r) => (
            <div className="result-row" key={r.id}>
              <div>
                <strong>{r.data.title}</strong>
                <p className="muted">
                  {r.data.topic} · {date(r.data.date)}
                </p>
                <p>{r.data.recommendation}</p>
              </div>
              <Badge tone="mint">
                {r.data.score}/{r.data.maxScore}
              </Badge>
            </div>
          ))}
          {!results.length && <Empty title="Зафиксируем первый результат" />}
        </section>
      )}
      {tab === 'documents' && (
        <section className="panel">
          <div className="list-links">
            {records.document
              .filter((r) => r.student_id === id)
              .map((r) => (
                <Link to="/documents" key={r.id}>
                  <FileText size={17} />
                  {r.data.title}
                  <ArrowRight size={16} />
                </Link>
              ))}
          </div>
          <Link className="btn btn-secondary" to="/documents">
            Открыть документы
          </Link>
        </section>
      )}
      {edit && <StudentEditor student={s} onClose={() => setEdit(false)} />}{' '}
      {invite && (
        <InviteDialog url={invite} title="Вход в кабинет · 7 дней" onClose={() => setInvite('')} />
      )}{' '}
      {permalink && (
        <InviteDialog
          url={permalink}
          title="Одна ссылка на все занятия"
          description="Отправьте эту ссылку ученику один раз. Она открывает вход на занятие и общую учебную доску; от урока к уроку ссылка не меняется."
          onClose={() => setPermalink('')}
        />
      )}
      {editor && <EntryEditor kind={editor} studentId={s.id} onClose={() => setEditor(null)} />}
      {openedLesson && <LessonDialog entry={openedLesson} onClose={() => setOpenedLesson(null)} />}
    </>
  );
}
export function LessonRow({
  entry,
  onClick,
  index = 0,
}: {
  entry: Entry;
  onClick: () => void;
  index?: number;
}) {
  const { studentName, students } = useApp();
  const s = students.find((s) => s.id === entry.student_id);
  return (
    <button
      className={`lesson-row ${entry.data.status === 'cancelled' ? 'cancelled' : ''}`}
      onClick={onClick}
    >
      <div className="lesson-time">
        <strong>
          {date(entry.data.start, {
            hour: '2-digit',
            minute: '2-digit',
            day: undefined,
            month: undefined,
          })}
        </strong>
        <small>{entry.data.duration} мин</small>
      </div>
      <span className={`lesson-marker marker-${index % 3}`} />
      <Avatar name={s?.name || 'Урок'} color={s?.color} small />
      <div className="lesson-description">
        <strong>{entry.data.title}</strong>
        <small>
          {entry.student_id ? studentName(entry.student_id) : 'Без ученика'}
          {entry.data.studentIds?.length > 0 ? ' · мини-группа' : ''}
        </small>
      </div>
      <Badge
        tone={
          entry.data.status === 'completed'
            ? 'mint'
            : entry.data.status === 'cancelled'
              ? 'gray'
              : 'purple'
        }
      >
        {statusLabels[entry.data.status]}
      </Badge>
      <ArrowUpRight size={17} />
    </button>
  );
}
export function LessonDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const { user, update, refresh, studentName, toast } = useApp(),
    navigate = useNavigate();
  const [edit, setEdit] = useState(false),
    [request, setRequest] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (edit)
    return (
      <EntryEditor
        kind="lesson"
        entry={entry}
        onClose={() => {
          setEdit(false);
          onClose();
        }}
      />
    );
  return (
    <Modal title={entry.data.title} onClose={onClose}>
      <Badge>{statusLabels[entry.data.status]}</Badge>
      <div className="detail-lines">
        <p>
          <CalendarDays size={18} />
          {date(entry.data.start, { weekday: 'long', hour: '2-digit', minute: '2-digit' })} · МСК
        </p>
        <p>
          <Clock3 size={18} />
          {entry.data.duration} минут
        </p>
        <p>
          <Users size={18} />
          {[entry.student_id, ...(entry.data.studentIds || [])]
            .filter((v, i, a) => v && a.indexOf(v) === i)
            .map(studentName)
            .join(', ') || 'Без ученика'}
        </p>
      </div>
      {entry.data.notes && <p className="pre-wrap note-box">{entry.data.notes}</p>}
      {entry.data.rescheduleRequest && (
        <p className="form-error">Запрос на перенос: {entry.data.rescheduleRequest}</p>
      )}
      <FormError error={error} />
      <div className="form-actions">
        {user.role === 'teacher' && (
          <Button variant="secondary" onClick={() => setEdit(true)}>
            <Pencil size={16} />
            Изменить
          </Button>
        )}
        <Button
          disabled={
            busy ||
            entry.data.status === 'cancelled' ||
            (!entry.student_id && !entry.data.studentIds?.length)
          }
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const room = await api(`/lessons/${entry.id}/classroom`, {});
              await refresh();
              onClose();
              const ended = room.sessions.find((s: any) => s.lesson_id === entry.id && s.ended_at);
              navigate(
                ended
                  ? `/lesson/${room.id}/summary/${ended.id}`
                  : entry.data.status === 'completed'
                    ? `/board/${entry.data.materialBoardId || entry.data.boardId || room.board_id}`
                    : `/lesson/${room.id}?lesson=${entry.id}`,
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Play size={16} />
          {entry.data.status === 'completed' ? 'Итоги и материалы' : 'Войти на урок'}
        </Button>
      </div>
      {user.role === 'student' && (
        <div className="reschedule-box">
          <Field label="Попросить перенести урок">
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Напишите удобное время и причину"
              rows={2}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={!request.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await update(entry, { rescheduleRequest: request });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Отправить запрос
          </Button>
        </div>
      )}
    </Modal>
  );
}
