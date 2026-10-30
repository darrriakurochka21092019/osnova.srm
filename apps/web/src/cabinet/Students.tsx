import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Users,
  ArrowRight,
  Pencil,
  Play,
  FileText,
  BookOpen,
  CalendarDays,
  Target,
  Copy,
  Mail,
  Clock3,
  CheckCircle2,
  Printer,
  Bell,
  LockKeyhole,
} from 'lucide-react';
import type { Classroom, Entry } from '../../../../packages/contracts';
import { api, date, money, statusLabels } from '../api';
import { useApp } from '../store';
import { Avatar, Badge, Button, Empty, Modal, PageHead, SearchBox } from '../ui';
import { StudentEditor, EntryEditor, InviteDialog } from '../pages/editors';
import { LessonDialog, LessonRow, SectionHeading } from '../pages/workspace';
import { Menu, Privacy, WorkBadge } from './shared';
import { Brand } from '../Brand';

export function StudentsPage() {
  const { students, classrooms, records } = useApp();
  const [create, setCreate] = useState(false),
    [edit, setEdit] = useState<string | null>(null),
    [tab, setTab] = useState('students'),
    [query, setQuery] = useState(''),
    [grade, setGrade] = useState(''),
    [program, setProgram] = useState('');
  const grades = [...new Set(students.map((s) => s.grade).filter(Boolean))];
  const programs = [...new Set(students.map((s) => s.program.split('\n')[0]).filter(Boolean))];
  const groups = classrooms.filter((c) => c.kind === 'group');
  const list = students.filter(
    (s) =>
      (tab === 'paused' ? s.status === 'paused' : s.status === 'active') &&
      s.name.toLowerCase().includes(query.toLowerCase()) &&
      (!grade || s.grade === grade) &&
      (!program || s.program.split('\n')[0] === program),
  );
  return (
    <>
      <PageHead
        title="Ученики"
        description="Индивидуальные занятия и мини-группы"
        action={
          <Button onClick={() => setCreate(true)}>
            <Plus size={19} />
            Добавить ученика
          </Button>
        }
      />
      <div className="tabs page-tabs">
        {[
          ['students', 'Ученики', students.filter((s) => s.status === 'active').length],
          ['groups', 'Мини-группы', groups.length],
          ['paused', 'Пауза', students.filter((s) => s.status === 'paused').length],
        ].map(([value, label, count]) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(String(value))}
          >
            {label}
            <Badge>{count}</Badge>
          </button>
        ))}
      </div>
      {tab !== 'groups' && (
        <>
          <div className="cabinet-filters">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Имя ученика"
              label="Поиск ученика"
            />
            <select
              aria-label="Фильтр по классу"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">Все классы</option>
              {grades.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
            <select
              aria-label="Программа обучения"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
            >
              <option value="">Все программы</option>
              {programs.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <section className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ученик</th>
                    <th>Программа</th>
                    <th>Следующий урок</th>
                    <th>Домашняя работа</th>
                    <th>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => {
                    const next = records.lesson
                      .filter(
                        (l) =>
                          (l.student_id === s.id || l.data.studentIds?.includes(s.id)) &&
                          ['planned', 'rescheduled', 'live'].includes(l.data.status) &&
                          (l.data.status === 'live' ||
                            new Date(l.data.start).getTime() + l.data.duration * 60000 >
                              Date.now()),
                      )
                      .sort((a, b) => a.data.start.localeCompare(b.data.start))[0];
                    const works = records.homework
                      .filter((h) => h.student_id === s.id)
                      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
                    const work = works.find((h) => h.data.status === 'submitted') || works[0];
                    return (
                      <tr key={s.id}>
                        <td>
                          <Link className="table-person" to={`/students/${s.id}`}>
                            <Avatar name={s.name} color={s.color} />
                            <div>
                              <strong>{s.name}</strong>
                              <small>{s.grade || 'Класс не указан'}</small>
                            </div>
                          </Link>
                        </td>
                        <td>
                          <span className="table-person">
                            <BookOpen size={21} />
                            <span>{s.program.split('\n')[0] || s.subject || 'Не указана'}</span>
                          </span>
                        </td>
                        <td>
                          {next ? (
                            <>
                              <CalendarDays size={15} />{' '}
                              {date(next.data.start, {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              МСК
                            </>
                          ) : (
                            <span className="muted">Не запланирован</span>
                          )}
                        </td>
                        <td>
                          {work ? (
                            <Link to={`/homework/${work.id}`}>
                              <WorkBadge entry={work} />
                            </Link>
                          ) : (
                            <Badge tone="gray">Нет заданий</Badge>
                          )}
                        </td>
                        <td>
                          <Badge tone={s.status === 'active' ? 'mint' : 'gray'}>
                            {statusLabels[s.status]}
                          </Badge>
                        </td>
                        <td>
                          <div className="button-row">
                            <Link className="btn btn-secondary" to={`/students/${s.id}`}>
                              Карточка <ArrowRight size={14} />
                            </Link>
                            <Menu label={`Действия: ${s.name}`}>
                              <button onClick={() => setEdit(s.id)}>
                                <Pencil size={15} />
                                Изменить карточку
                              </button>
                              <Link to={`/students/${s.id}?tab=program`}>
                                <BookOpen size={15} />
                                Программа обучения
                              </Link>
                            </Menu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!list.length && (
              <Empty
                icon={Users}
                title={students.length ? 'Ученики не найдены' : 'Добавьте первого ученика'}
                text="Карточка объединит занятия, задания и учебную программу."
              />
            )}
            <div className="cabinet-table-foot">
              Показано {list.length} из {students.length} учеников
            </div>
          </section>
        </>
      )}
      {(tab === 'students' || tab === 'groups') && (
        <section className="panel">
          <SectionHeading title="Мини-группы" to="/lessons" />
          <div className="cabinet-columns">
            {groups.map((g) => (
              <Link className="cabinet-group" key={g.id} to={`/lesson/${g.id}`}>
                <span className="round-icon purple">
                  <Users size={25} />
                </span>
                <div>
                  <h3>{g.title}</h3>
                  <small>{g.students.map((s) => s.name).join(', ')}</small>
                  {g.lesson && (
                    <small className="table-subtitle">
                      Следующий урок ·{' '}
                      {date(g.lesson.data.start, { hour: '2-digit', minute: '2-digit' })} МСК
                    </small>
                  )}
                </div>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
          {!groups.length && (
            <Empty
              icon={Users}
              title="Мини-групп пока нет"
              text="Выберите нескольких учеников при планировании урока — их общая комната появится автоматически."
              action={
                <Link className="text-link" to="/schedule">
                  Запланировать занятие <ArrowRight size={15} />
                </Link>
              }
            />
          )}
        </section>
      )}
      {create && <StudentEditor onClose={() => setCreate(false)} />}
      {edit && (
        <StudentEditor
          student={students.find((s) => s.id === edit)}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}

export function StudentDetail() {
  const { id } = useParams(),
    [search, setSearch] = useSearchParams(),
    navigate = useNavigate();
  const { students, classrooms, records, boards, toast } = useApp();
  const [edit, setEdit] = useState(false),
    [invite, setInvite] = useState(''),
    [permalink, setPermalink] = useState(''),
    [editor, setEditor] = useState<
      'lesson' | 'homework' | 'result' | 'notification' | 'note' | null
    >(null),
    [opened, setOpened] = useState<Entry | null>(null),
    [print, setPrint] = useState(false);
  const s = students.find((x) => x.id === id),
    tab = search.get('tab') || 'overview';
  if (!s)
    return (
      <Empty title="Ученик не найден" action={<Link to="/students">К списку учеников</Link>} />
    );
  const setTab = (value: string) => setSearch(value === 'overview' ? {} : { tab: value });
  const lessons = records.lesson
    .filter((r) => r.student_id === id || r.data.studentIds?.includes(id))
    .sort((a, b) => b.data.start.localeCompare(a.data.start));
  const next = lessons
    .filter(
      (l) =>
        ['planned', 'rescheduled', 'live'].includes(l.data.status) &&
        (l.data.status === 'live' ||
          new Date(l.data.start).getTime() + l.data.duration * 60000 > Date.now()),
    )
    .sort((a, b) => a.data.start.localeCompare(b.data.start))[0];
  const homework = records.homework.filter((r) => r.student_id === id),
    results = records.result.filter((r) => r.student_id === id),
    notes = records.note.filter((r) => r.student_id === id);
  const topics = [
    ...new Map(
      [...results]
        .sort((a, b) => a.data.date.localeCompare(b.data.date))
        .map((r) => [r.data.topic, r]),
    ).values(),
  ];
  const mastered = topics.filter((r) => r.data.skill === 'mastered').length;
  const room = classrooms.find(
    (r) => r.kind === 'individual' && r.students.some((m) => m.id === id),
  );
  const getRoom = async () => room || (await api<Classroom>('/classrooms', { studentIds: [s.id] }));
  const enter = async (prepare = false) => {
    try {
      const r = await getRoom();
      navigate(`/lesson/${r.id}${prepare ? '/prepare' : ''}${next ? `?lesson=${next.id}` : ''}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const paid = records.transaction
      .filter((r) => r.student_id === id && r.data.type === 'payment')
      .reduce((a, r) => a + r.data.amount, 0),
    charged = lessons
      .filter((r) => r.data.status === 'completed')
      .reduce((a, r) => a + r.data.price, 0),
    balance = paid - charged;
  const sections = s.program.trim()
    ? s.program
        .trim()
        .split(/\n\s*\n/)
        .map((block) => block.split('\n').filter(Boolean))
    : [];
  const noteEditor = (
    <Button variant="secondary" onClick={() => setEditor('note')}>
      <Plus size={15} />
      Заметка
    </Button>
  );
  return (
    <>
      <div className="student-detail-head">
        <Avatar name={s.name} color={s.color} />
        <div>
          <h1>{tab === 'program' ? 'Индивидуальная программа' : s.name}</h1>
          <p className="muted">
            {tab === 'program' ? `${s.name} · ` : ''}
            {[s.grade, s.subject].filter(Boolean).join(' · ')}{' '}
            <Badge tone={s.status === 'active' ? 'mint' : 'gray'}>{statusLabels[s.status]}</Badge>
          </p>
        </div>
        <div className="button-row">
          {tab === 'program' ? (
            <>
              <Button variant="secondary" onClick={() => setPrint(true)}>
                <Printer size={17} />
                Экспорт
              </Button>
              <Button onClick={() => setEdit(true)}>
                <Pencil size={17} />
                Редактировать программу
              </Button>
            </>
          ) : (
            <>
              <Button disabled={s.status === 'paused'} onClick={() => void enter()}>
                <Play size={17} />
                Начать урок
              </Button>
              <Link className="btn btn-secondary" to={`/homework/new?student=${s.id}`}>
                <FileText size={17} />
                Назначить задание
              </Link>
              <Menu label="Действия с учеником">
                <button onClick={() => setEdit(true)}>
                  <Pencil size={16} />
                  Карточка ученика
                </button>
                <button
                  onClick={async () => {
                    try {
                      setPermalink((await getRoom()).link || '');
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  <Copy size={16} />
                  Ссылка на занятия
                </button>
                <button
                  onClick={async () => {
                    try {
                      setInvite((await api(`/students/${s.id}/invite`, {})).url);
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  <Mail size={16} />
                  Вход в кабинет ученика
                </button>
                <button onClick={() => setEditor('lesson')}>
                  <CalendarDays size={16} />
                  Запланировать урок
                </button>
                <button onClick={() => setEditor('notification')}>
                  <Bell size={16} />
                  Уведомить ученика
                </button>
              </Menu>
            </>
          )}
        </div>
      </div>
      <div className="tabs page-tabs">
        {[
          ['overview', 'Обзор'],
          ['program', 'Программа'],
          ['lessons', 'Занятия'],
          ['homework', 'Работы'],
          ['results', 'Прогресс'],
          ['documents', 'Документы'],
        ].map(([v, n]) => (
          <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
            {n}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <div className="cabinet-grid">
          <div>
            <section className="student-classroom-card">
              <div>
                <span className="eyebrow">
                  {next ? 'Следующее занятие' : 'Постоянная учебная комната'}
                </span>
                <h2>
                  {next
                    ? `${date(next.data.start, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} МСК`
                    : 'Всё готово к занятиям'}
                </h2>
                <p>
                  <BookOpen size={20} /> {next?.data.title || 'Одна доска для всех ваших уроков'}
                </p>
                <div className="button-row">
                  <Button onClick={() => void enter()}>
                    <Play size={17} />
                    Открыть доску
                  </Button>
                  <Button variant="secondary" onClick={() => void enter(true)}>
                    <FileText size={17} />
                    Подготовить урок
                  </Button>
                </div>
              </div>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Последние занятия</h2>
                <button className="text-link" onClick={() => setTab('lessons')}>
                  Все занятия <ArrowRight size={15} />
                </button>
              </div>
              {lessons
                .filter((l) => l.data.status === 'completed')
                .slice(0, 3)
                .map((l) => (
                  <LessonRow key={l.id} entry={l} onClick={() => setOpened(l)} />
                ))}
              {!lessons.some((l) => l.data.status === 'completed') && (
                <Empty icon={CalendarDays} title="Здесь появится история занятий" />
              )}
            </section>
            <section className="panel">
              <SectionHeading title="Домашняя работа" />
              {homework.slice(0, 3).map((h) => (
                <Link className="cabinet-mini-row" to={`/homework/${h.id}`} key={h.id}>
                  <span className="round-icon blue">
                    <FileText size={21} />
                  </span>
                  <div>
                    <strong>{h.data.title}</strong>
                    <small>До {date(h.data.due, { hour: '2-digit', minute: '2-digit' })} МСК</small>
                  </div>
                  <WorkBadge entry={h} />
                  <ArrowRight size={16} />
                </Link>
              ))}
              {!homework.length && <p className="muted">Заданий пока нет.</p>}
            </section>
            {boards.some((b) => b.student_id === id && b.id !== room?.board_id) && (
              <section className="panel">
                <SectionHeading title="Прежние материалы" />
                <div className="list-links">
                  {boards
                    .filter((b) => b.student_id === id && b.id !== room?.board_id)
                    .map((b) => (
                      <Link to={`/board/${b.id}`} key={b.id}>
                        <BookOpen size={18} />
                        {b.title}
                        <ArrowRight size={16} />
                      </Link>
                    ))}
                </div>
              </section>
            )}
          </div>
          <div>
            <section className="panel">
              <div className="section-heading">
                <h2>
                  <Target size={23} /> Учебная цель
                </h2>
                <button
                  className="icon-btn"
                  aria-label="Изменить цель"
                  onClick={() => setEdit(true)}
                >
                  <Pencil size={17} />
                </button>
              </div>
              <div className="cabinet-goal">
                <p>{s.goal || 'Определите цель вместе с учеником'}</p>
                {topics.length > 0 && (
                  <>
                    <small>
                      Освоено {mastered} из {topics.length} отслеживаемых тем
                    </small>
                    <div className="cabinet-progress">
                      <i style={{ width: `${(100 * mastered) / topics.length}%` }} />
                    </div>
                  </>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Заметки преподавателя</h2>
                {noteEditor}
              </div>
              <Privacy />
              {notes.map((n) => (
                <div className="cabinet-note" key={n.id} style={{ marginTop: 12 }}>
                  <strong>{n.data.title}</strong>
                  <p className="pre-wrap">{n.data.text}</p>
                  <button className="text-link" onClick={() => navigate('/tasks')}>
                    Открыть заметки <ArrowRight size={14} />
                  </button>
                </div>
              ))}
              {!notes.length && <p className="muted">Запишите наблюдение после занятия.</p>}
            </section>
            <section className="panel">
              <h2>Оплата</h2>
              <div className="cabinet-goal">
                <strong>
                  {balance < 0
                    ? `К оплате ${money(-balance)}`
                    : balance > 0
                      ? `Аванс ${money(balance)}`
                      : 'Баланс 0 ₽'}
                </strong>
                <p className="muted small-text">Оплаты минус стоимость проведённых занятий.</p>
              </div>
              <Link className="text-link" to="/finances">
                Открыть расчёты <ArrowRight size={15} />
              </Link>
            </section>
          </div>
        </div>
      )}
      {tab === 'program' && (
        <>
          <section className="panel cabinet-note">
            <span className="round-icon purple">
              <Target size={29} />
            </span>
            <h3>Цель обучения</h3>
            <p className="pre-wrap">{s.goal || 'Добавьте цель обучения в карточке ученика.'}</p>
          </section>
          <div className="cabinet-grid">
            <section className="panel">
              {sections.map((lines, i) => (
                <details className="cabinet-program" key={i} open>
                  <summary>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    {lines[0]}
                  </summary>
                  {lines.length > 1 && (
                    <div>
                      {lines.slice(1).map((line, j) => {
                        const result = topics.find(
                          (r) =>
                            r.data.topic.toLocaleLowerCase() ===
                            line.replace(/^[-•\d.\s]+/, '').toLocaleLowerCase(),
                        );
                        return (
                          <div className="cabinet-topic" key={j}>
                            <CheckCircle2
                              size={17}
                              className={
                                result?.data.skill === 'mastered' ? 'text-success' : 'muted'
                              }
                            />
                            <span>{line}</span>
                            {result && (
                              <Badge tone={result.data.skill === 'mastered' ? 'mint' : 'purple'}>
                                {statusLabels[result.data.skill]}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </details>
              ))}
              {!sections.length && (
                <Empty
                  icon={BookOpen}
                  title="Добавьте учебные блоки"
                  text="Запишите программу: название блока и темы с новой строки, между блоками — пустая строка."
                  action={<Button onClick={() => setEdit(true)}>Редактировать программу</Button>}
                />
              )}
            </section>
            <div>
              <section className="panel">
                <h2>На ближайшие уроки</h2>
                <div className="cabinet-timeline">
                  {[...lessons]
                    .reverse()
                    .filter(
                      (l) =>
                        ['planned', 'rescheduled'].includes(l.data.status) &&
                        new Date(l.data.start).getTime() > Date.now(),
                    )
                    .slice(0, 3)
                    .map((l, i) => (
                      <div key={l.id}>
                        <Badge>{i + 1}</Badge>
                        <div>
                          <strong>{l.data.title}</strong>
                          <p>{date(l.data.start, { hour: '2-digit', minute: '2-digit' })} МСК</p>
                          <button className="text-link" onClick={() => setOpened(l)}>
                            Открыть занятие <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
                {!next && <p className="muted">Следующие занятия ещё не запланированы.</p>}
              </section>
              <section className="panel cabinet-note peach">
                <h2>Повторить</h2>
                {topics
                  .filter((r) => r.data.skill === 'repeat')
                  .map((r) => (
                    <p key={r.id}>
                      <strong>{r.data.topic}</strong>
                      <br />
                      {r.data.recommendation}
                    </p>
                  ))}
                {!topics.some((r) => r.data.skill === 'repeat') && (
                  <p>Темы появятся по результатам работ.</p>
                )}
              </section>
            </div>
          </div>
        </>
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
          {lessons.map((l) => (
            <LessonRow key={l.id} entry={l} onClick={() => setOpened(l)} />
          ))}
          {!lessons.length && <Empty title="Пока нет занятий" />}
        </section>
      )}
      {tab === 'homework' && (
        <section className="panel">
          <SectionHeading title="Домашние задания" />
          <div className="list-links">
            {homework.map((h) => (
              <Link key={h.id} to={`/homework/${h.id}`}>
                <FileText size={18} />
                {h.data.title}
                <WorkBadge entry={h} />
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
          <SectionHeading title="Документы ученика" />
          <div className="list-links">
            {records.document
              .filter((r) => r.student_id === id)
              .map((r) => (
                <Link to={`/documents?student=${s.id}`} key={r.id}>
                  <FileText size={18} />
                  {r.data.title}
                  <ArrowRight size={15} />
                </Link>
              ))}
          </div>
          <Link className="btn btn-secondary" to={`/documents?student=${s.id}`}>
            Открыть документы
          </Link>
        </section>
      )}
      {edit && <StudentEditor student={s} onClose={() => setEdit(false)} />}
      {editor && <EntryEditor kind={editor} studentId={s.id} onClose={() => setEditor(null)} />}
      {opened && <LessonDialog entry={opened} onClose={() => setOpened(null)} />}
      {invite && (
        <InviteDialog url={invite} title="Вход в кабинет · 7 дней" onClose={() => setInvite('')} />
      )}
      {permalink && (
        <InviteDialog
          url={permalink}
          title="Одна ссылка на все занятия"
          onClose={() => setPermalink('')}
        />
      )}
      {print && (
        <Modal title="Индивидуальная программа" wide onClose={() => setPrint(false)}>
          <article className="print-sheet">
            <Brand />
            <h1>Индивидуальная программа</h1>
            <p>
              {s.name} · {s.grade} · {s.subject}
            </p>
            <h2>Цель обучения</h2>
            <p className="pre-wrap">{s.goal}</p>
            <h2>Программа</h2>
            <p className="pre-wrap">{s.program}</p>
          </article>
          <div className="form-actions screen-only">
            <Button onClick={() => window.print()}>
              <Printer size={17} />
              Печать / сохранить в PDF
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
