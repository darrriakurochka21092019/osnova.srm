import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Copy,
  CreditCard,
  FileText,
  GraduationCap,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Pin,
  Play,
  Plus,
  Target,
} from 'lucide-react';
import type { Classroom, Entry, RecordKind } from '../../../../packages/contracts';
import { api, date, localInput, money, statusLabels } from '../api';
import { useApp } from '../store';
import { Avatar, Badge, Button, Empty, FileLinks, Modal } from '../ui';
import { EntryEditor, InviteDialog, StudentEditor } from './editors';
import { LessonDialog, LessonRow } from './workspace';
import { studentProfileData } from './student-profile-data';
import './student-profile.css';

type Tab = 'overview' | 'program' | 'lessons' | 'homework' | 'results' | 'documents';
const tabs: [Tab, string][] = [
  ['overview', 'Обзор'],
  ['program', 'Программа'],
  ['lessons', 'Занятия'],
  ['homework', 'Работы'],
  ['results', 'Прогресс'],
  ['documents', 'Документы'],
];
const time = (value: string | Date) => localInput(value).slice(11, 16);
const endTime = (entry: Entry) =>
  time(new Date(Date.parse(entry.data.start) + entry.data.duration * 60_000));
const initialsName = (name: string) =>
  name.trim().includes(' ') ? name : name.slice(0, 2).split('').join(' ');

export function StudentDetailPage() {
  const { id = '' } = useParams();
  const { students, records, classrooms, boards, toast } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [now, setNow] = useState(Date.now);
  const [editingStudent, setEditingStudent] = useState(false);
  const [editor, setEditor] = useState<{ kind: RecordKind; entry?: Entry } | null>(null);
  const [openedLesson, setOpenedLesson] = useState<Entry | null>(null);
  const [opening, setOpening] = useState(false);
  const [link, setLink] = useState<{ url: string; cabinet: boolean } | null>(null);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [menuTarget, setMenuTarget] = useState<HTMLButtonElement | null>(null);
  const [allNotes, setAllNotes] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setTab('overview');
    setEditor(null);
    setOpenedLesson(null);
    setMenuTarget(null);
    setPaymentsOpen(false);
    setLink(null);
    setEditingStudent(false);
    setAllNotes(false);
  }, [id]);
  const student = students.find((pupil) => pupil.id === id);
  if (!student)
    return (
      <Empty title="Ученик не найден" action={<Link to="/students">К списку учеников</Link>} />
    );
  const data = studentProfileData(id, records, now);
  const room = classrooms.find(
    (classroom) =>
      classroom.kind === 'individual' && classroom.students.some((member) => member.id === id),
  );
  const meta = [student.grade, student.subject, student.program].filter(Boolean).join(' · ');
  const today = localInput(new Date(now)).slice(0, 10);
  const nextDay = data.next ? localInput(data.next.data.start).slice(0, 10) : '';
  const nextDate = data.next
    ? `${nextDay === today ? 'Сегодня' : nextDay === localInput(new Date(now + 86_400_000)).slice(0, 10) ? 'Завтра' : date(data.next.data.start, { month: 'short' }).replace('.', '')}, ${time(data.next.data.start)}–${endTime(data.next)} МСК`
    : '';
  const openEditor = (kind: RecordKind, entry?: Entry) => setEditor({ kind, entry });
  const getRoom = async (entry?: Entry) =>
    entry
      ? api<Classroom>(`/lessons/${entry.id}/classroom`, {})
      : room || api<Classroom>('/classrooms', { studentIds: [id] });
  const openLesson = async (destination: 'entry' | 'board' | 'prepare') => {
    setOpening(true);
    try {
      const actual = await getRoom(data.next);
      const query = data.next ? `?lesson=${data.next.id}` : '';
      navigate(
        destination === 'board'
          ? `/board/${actual.board_id}${query}`
          : `/lesson/${actual.id}${destination === 'prepare' ? '/prepare' : ''}${query}`,
      );
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setOpening(false);
    }
  };
  const showLink = async (cabinet = false) => {
    setMenuTarget(null);
    try {
      const url = cabinet ? (await api(`/students/${id}/invite`, {})).url : (await getRoom()).link;
      if (!url) throw new Error('Не удалось получить ссылку на занятия');
      setLink({ url, cabinet });
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const switchTab = (value: Tab) => {
    setTab(value);
    setMenuTarget(null);
  };
  const balanceText =
    data.balance < 0
      ? `К оплате ${money(-data.balance)}`
      : data.balance > 0
        ? `Аванс ${money(data.balance)}`
        : data.payments.length || data.completed.length
          ? 'Расчёты закрыты'
          : 'Оплат пока нет';
  const menuActions = [
    { text: 'Изменить карточку', icon: Pencil, action: () => setEditingStudent(true) },
    { text: 'Ссылка на занятия', icon: Copy, action: () => void showLink() },
    { text: 'Настроить вход ученика', icon: Mail, action: () => void showLink(true) },
    { text: 'Запланировать урок', icon: CalendarDays, action: () => openEditor('lesson') },
    { text: 'Добавить результат', icon: Target, action: () => openEditor('result') },
    { text: 'Уведомить ученика', icon: Mail, action: () => openEditor('notification') },
  ];

  return (
    <div className="student-profile">
      <header className="sp-header">
        <div className="sp-person">
          <Avatar name={initialsName(student.name)} />
          <div>
            <h1>{student.name}</h1>
            <div className="sp-description">
              <p title={meta}>{meta || 'Карточка ученика'}</p>
              <span className={`sp-student-status ${student.status}`}>
                <GraduationCap size={24} />
                {student.status === 'active' ? 'Учится' : 'На паузе'}
              </span>
            </div>
          </div>
        </div>
        <div className="sp-header-actions">
          <Button
            disabled={opening || student.status === 'paused'}
            onClick={() => void openLesson('entry')}
          >
            <Play size={23} />
            Начать урок
          </Button>
          <Button variant="secondary" onClick={() => openEditor('homework')}>
            <FileText size={25} />
            Назначить задание
          </Button>
          <button
            className="sp-more"
            aria-label="Дополнительные действия"
            aria-haspopup="menu"
            aria-expanded={Boolean(menuTarget)}
            onClick={(e) => setMenuTarget(menuTarget ? null : e.currentTarget)}
          >
            <MoreHorizontal size={25} />
          </button>
        </div>
      </header>
      <div
        className="sp-tabs"
        role="tablist"
        aria-label="Разделы карточки ученика"
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const current = tabs.findIndex(([value]) => value === tab);
          const next =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? tabs.length - 1
                : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          switchTab(tabs[next][0]);
          e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}
      >
        {tabs.map(([value, title]) => (
          <button
            key={value}
            role="tab"
            id={`sp-tab-${value}`}
            aria-selected={tab === value}
            aria-controls="sp-tab-panel"
            tabIndex={tab === value ? 0 : -1}
            onClick={() => switchTab(value)}
          >
            {title}
          </button>
        ))}
      </div>

      <div id="sp-tab-panel" role="tabpanel" aria-labelledby={`sp-tab-${tab}`}>
        {tab === 'overview' && (
          <div className="sp-overview">
            <div className="sp-main-column">
              <section className="sp-hero" aria-label="Следующий урок">
                <div className="sp-hero-copy">
                  <span className="sp-next-label">
                    <i />
                    {data.next?.data.status === 'live' ? 'Урок уже идёт' : 'Следующее занятие'}
                  </span>
                  <h2>{data.next ? nextDate : 'Нет запланированных занятий'}</h2>
                  <div className="sp-hero-topic">
                    <BookOpen size={36} />
                    <div>
                      <h3>{data.next?.data.title || 'Одна доска — все ваши уроки'}</h3>
                      <p>
                        {data.next
                          ? [
                              data.next.data.subject || student.subject,
                              student.grade,
                              student.program,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : 'Материалы и история занятий сохраняются в учебной комнате.'}
                      </p>
                    </div>
                  </div>
                  <div className="sp-hero-actions">
                    {data.next ? (
                      <Button
                        className="sp-open-board"
                        disabled={opening || student.status === 'paused'}
                        onClick={() => void openLesson('board')}
                      >
                        <Play size={23} />
                        Открыть доску
                      </Button>
                    ) : (
                      <Button className="sp-open-board" onClick={() => openEditor('lesson')}>
                        <Plus size={22} />
                        Запланировать урок
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      disabled={opening}
                      onClick={() => void openLesson('prepare')}
                    >
                      <FileText size={24} />
                      Подготовить урок
                    </Button>
                  </div>
                </div>
              </section>
              <section className="sp-panel sp-recent" aria-label="Последние занятия">
                <PanelHeading
                  title="Последние занятия"
                  action={
                    <button className="sp-text-button" onClick={() => switchTab('lessons')}>
                      Все занятия
                      <ChevronRightIcon />
                    </button>
                  }
                />
                {data.recent.length ? (
                  <div className="sp-timeline">
                    {data.recent.map((entry) => (
                      <article className="sp-lesson" key={entry.id}>
                        <div className="sp-lesson-date">
                          <strong>
                            {date(entry.data.start, { month: 'short' }).replace('.', '')}
                          </strong>
                          <small>
                            {time(entry.data.start)}–{endTime(entry)} МСК
                          </small>
                        </div>
                        <Avatar name={initialsName(student.name)} />
                        <div className="sp-lesson-topic">
                          <strong>{entry.data.title}</strong>
                          <small>
                            {[entry.data.subject || student.subject, student.grade]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </div>
                        <span className="sp-completed">
                          <CircleCheck size={18} />
                          Проведён
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() => setOpenedLesson(entry)}
                          aria-label={`Открыть занятие: ${entry.data.title}`}
                        >
                          <FileText size={23} />
                          Открыть
                        </Button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="sp-empty">
                    Проведённых занятий пока нет. Здесь появятся итоги ваших уроков.
                  </div>
                )}
              </section>
              <section className="sp-panel sp-homework" aria-label="Домашняя работа">
                <PanelHeading
                  title="Домашняя работа"
                  action={
                    data.homework.length > 2 ? (
                      <button className="sp-text-button" onClick={() => switchTab('homework')}>
                        Все работы
                        <ChevronRightIcon />
                      </button>
                    ) : undefined
                  }
                />
                {data.homework.length ? (
                  <div className="sp-homework-list">
                    {data.homework.slice(0, 2).map((entry) => (
                      <HomeworkRow entry={entry} key={entry.id} />
                    ))}
                  </div>
                ) : (
                  <div className="sp-empty">
                    Домашних заданий пока нет.
                    <button className="sp-text-button" onClick={() => openEditor('homework')}>
                      Назначить первое задание
                      <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </section>
            </div>
            <aside className="sp-side-column">
              <section className="sp-panel sp-goal" aria-label="Учебная цель">
                <PanelHeading
                  icon={<Target size={30} />}
                  title="Учебная цель"
                  tone="mint"
                  action={
                    <button
                      className="icon-btn"
                      aria-label="Изменить цель"
                      onClick={() => setEditingStudent(true)}
                    >
                      <MoreVertical size={22} />
                    </button>
                  }
                />
                <div className="sp-goal-content">
                  <h3>{student.goal || 'Пока не определена'}</h3>
                  {data.latestResult ? (
                    <>
                      <p>Последний результат · {data.latestResult.data.title}</p>
                      <div className="sp-progress-line">
                        <div
                          role="progressbar"
                          aria-label="Последний результат"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.max(0, Math.min(100, data.resultPercent!))}
                        >
                          <i
                            style={{ width: `${Math.max(0, Math.min(100, data.resultPercent!))}%` }}
                          />
                        </div>
                        <span>{data.resultPercent}%</span>
                      </div>
                    </>
                  ) : (
                    <p>Результатов пока нет. Зафиксируйте первую работу в разделе «Прогресс».</p>
                  )}
                </div>
              </section>
              <section className="sp-panel sp-notes" aria-label="Заметки преподавателя">
                <PanelHeading
                  icon={<LockKeyhole size={24} />}
                  title="Заметки преподавателя"
                  subtitle="Видно только вам"
                  action={
                    <button
                      className="icon-btn"
                      aria-label="Добавить заметку"
                      onClick={() => openEditor('note')}
                    >
                      <Plus size={21} />
                    </button>
                  }
                />
                {data.notes.length ? (
                  <div className="sp-notes-list">
                    {data.notes.slice(0, allNotes ? data.notes.length : 3).map((note, index) => (
                      <article className={`sp-note ${index ? 'compact' : ''}`} key={note.id}>
                        {index > 0 && <Pin size={22} />}
                        <div>
                          <strong>{note.data.title}</strong>
                          {note.data.text && <p>{note.data.text}</p>}
                        </div>
                        <button
                          className="icon-btn"
                          aria-label={`Редактировать заметку: ${note.data.title}`}
                          onClick={() => openEditor('note', note)}
                        >
                          <MoreVertical size={21} />
                        </button>
                      </article>
                    ))}
                    {data.notes.length > 3 && (
                      <button
                        className="sp-text-button sp-show-notes"
                        aria-expanded={allNotes}
                        onClick={() => setAllNotes(!allNotes)}
                      >
                        {allNotes ? 'Свернуть заметки' : `Все заметки (${data.notes.length})`}
                      </button>
                    )}
                  </div>
                ) : (
                  <button className="sp-note-empty" onClick={() => openEditor('note')}>
                    <Plus size={18} />
                    Добавить личную заметку
                  </button>
                )}
              </section>
              <section className="sp-panel sp-payment" aria-label="Оплата">
                <PanelHeading icon={<CreditCard size={25} />} title="Оплата" />
                <div className={`sp-payment-summary ${data.balance < 0 ? 'debt' : ''}`}>
                  <CircleCheck size={32} />
                  <div>
                    <strong>{balanceText}</strong>
                    <span>
                      {data.payments[0]
                        ? `Последняя оплата ${date(data.payments[0].data.date, { month: 'short', year: 'numeric' })}`
                        : data.charged
                          ? 'За проведённые занятия'
                          : 'Здесь появится баланс ученика'}
                    </span>
                  </div>
                </div>
                <button className="sp-text-button" onClick={() => setPaymentsOpen(true)}>
                  Открыть расчёты
                  <ChevronRightIcon />
                </button>
              </section>
            </aside>
          </div>
        )}

        {tab === 'program' && (
          <section className="sp-panel sp-tab-content">
            <PanelHeading
              title="Индивидуальная программа"
              action={
                <Button variant="secondary" onClick={() => setEditingStudent(true)}>
                  <Pencil size={17} />
                  Редактировать программу
                </Button>
              }
            />
            <p className="sp-program-text">
              {student.program || 'Добавьте последовательность тем и учебных блоков.'}
            </p>
            <h3>Учебная цель</h3>
            <p className="sp-program-text">{student.goal || 'Пока не определена'}</p>
          </section>
        )}
        {tab === 'lessons' && (
          <section className="sp-panel sp-tab-content">
            <PanelHeading
              title="История и планы"
              action={
                <Button onClick={() => openEditor('lesson')}>
                  <Plus size={18} />
                  Запланировать урок
                </Button>
              }
            />
            {data.lessons.length ? (
              data.lessons.map((entry) => (
                <LessonRow key={entry.id} entry={entry} onClick={() => setOpenedLesson(entry)} />
              ))
            ) : (
              <Empty icon={CalendarDays} title="Пока нет занятий" />
            )}
          </section>
        )}
        {tab === 'homework' && (
          <section className="sp-panel sp-tab-content">
            <PanelHeading
              title="Домашние задания"
              action={
                <Button onClick={() => openEditor('homework')}>
                  <Plus size={18} />
                  Назначить задание
                </Button>
              }
            />
            {data.homework.length ? (
              data.homework.map((entry) => <HomeworkRow key={entry.id} entry={entry} />)
            ) : (
              <Empty icon={ClipboardCheck} title="Заданий пока нет" />
            )}
          </section>
        )}
        {tab === 'results' && (
          <section className="sp-panel sp-tab-content">
            <PanelHeading
              title="Результаты работ"
              action={
                <Button onClick={() => openEditor('result')}>
                  <Plus size={18} />
                  Добавить результат
                </Button>
              }
            />
            <div className="sp-metrics">
              <div>
                <strong>{data.completed.length}</strong>
                <span>Проведено занятий</span>
              </div>
              <div>
                <strong>
                  {data.homework.filter((entry) => entry.data.status === 'reviewed').length}
                </strong>
                <span>Работ проверено</span>
              </div>
              <div>
                <strong>
                  {data.results.filter((entry) => entry.data.skill === 'mastered').length}
                </strong>
                <span>Освоенных навыков</span>
              </div>
            </div>
            {data.results.map((entry) => (
              <article className="sp-result" key={entry.id}>
                <div>
                  <h3>{entry.data.title}</h3>
                  <small>
                    {entry.data.topic} · {date(entry.data.date)}
                  </small>
                  <p>{entry.data.recommendation}</p>
                </div>
                <Badge tone="mint">
                  {entry.data.score}/{entry.data.maxScore}
                </Badge>
              </article>
            ))}
            {!data.results.length && <Empty title="Зафиксируем первый результат" />}
          </section>
        )}
        {tab === 'documents' && (
          <section className="sp-panel sp-tab-content">
            <PanelHeading
              title="Документы ученика"
              action={
                <Button onClick={() => openEditor('document')}>
                  <Plus size={18} />
                  Добавить документ
                </Button>
              }
            />
            {records.document
              .filter((entry) => entry.student_id === id)
              .map((entry) => (
                <article className="sp-document" key={entry.id}>
                  <div>
                    <h3>{entry.data.title}</h3>
                    <FileLinks ids={entry.data.fileIds} />
                  </div>
                  <Button variant="secondary" onClick={() => openEditor('document', entry)}>
                    <Pencil size={16} />
                    Изменить
                  </Button>
                </article>
              ))}
            {!records.document.some((entry) => entry.student_id === id) && (
              <div className="sp-empty">Документов пока нет.</div>
            )}
            <Link className="sp-text-button" to="/documents">
              Открыть документы
              <ArrowRight size={16} />
            </Link>
            <h3 className="sp-legacy-heading">Материалы и доски</h3>
            {boards
              .filter((board) => board.student_id === id && board.id !== room?.board_id)
              .map((board) => (
                <Link className="sp-legacy-board" key={board.id} to={`/board/${board.id}`}>
                  <BookOpen size={19} />
                  {board.title}
                  <ArrowRight size={16} />
                </Link>
              ))}
            <Button variant="secondary" onClick={() => void openLesson('prepare')}>
              Открыть учебную комнату
            </Button>
          </section>
        )}
      </div>

      {editingStudent && (
        <StudentEditor key={id} student={student} onClose={() => setEditingStudent(false)} />
      )}
      {editor && (
        <EntryEditor
          key={`${id}-${editor.kind}-${editor.entry?.id || 'new'}`}
          kind={editor.kind}
          studentId={id}
          entry={editor.entry}
          onClose={() => setEditor(null)}
        />
      )}
      {openedLesson && <LessonDialog entry={openedLesson} onClose={() => setOpenedLesson(null)} />}
      {link && (
        <InviteDialog
          url={link.url}
          title={link.cabinet ? 'Вход в кабинет · 7 дней' : 'Одна ссылка на все занятия'}
          description={
            link.cabinet
              ? undefined
              : 'Личная ссылка ученика открывает его занятия и учебную доску.'
          }
          onClose={() => setLink(null)}
        />
      )}
      {paymentsOpen && (
        <Modal title="Расчёты с учеником" onClose={() => setPaymentsOpen(false)} wide>
          <p>{student.name}</p>
          <div className="sp-metrics">
            <div>
              <strong>{money(data.paid)}</strong>
              <span>Оплачено</span>
            </div>
            <div>
              <strong>{money(data.charged)}</strong>
              <span>Проведено занятий на сумму</span>
            </div>
            <div>
              <strong>{money(data.balance)}</strong>
              <span>{data.balance < 0 ? 'Задолженность' : 'Баланс'}</span>
            </div>
          </div>
          <div className="sp-payment-heading">
            <h3>История оплат</h3>
            <Button
              onClick={() => {
                setPaymentsOpen(false);
                openEditor('transaction');
              }}
            >
              <Plus size={17} />
              Добавить оплату
            </Button>
          </div>
          {data.payments.length ? (
            data.payments.map((entry) => (
              <div className="sp-payment-row" key={entry.id}>
                <span>{date(entry.data.date, { year: 'numeric' })}</span>
                <span>{entry.data.title}</span>
                <strong>{money(entry.data.amount)}</strong>
              </div>
            ))
          ) : (
            <div className="sp-empty">Оплат пока нет.</div>
          )}
          <h3 className="sp-legacy-heading">Начисления за проведённые занятия</h3>
          {data.completed.map((entry) => (
            <div className="sp-payment-row" key={entry.id}>
              <span>{date(entry.data.start)}</span>
              <span>{entry.data.title}</span>
              <strong>{money(entry.data.price)}</strong>
            </div>
          ))}
          <Link className="sp-text-button" to="/finances">
            Все финансы
            <ArrowRight size={16} />
          </Link>
        </Modal>
      )}
      {menuTarget && (
        <ProfileMenu
          target={menuTarget}
          onClose={() => setMenuTarget(null)}
          actions={menuActions.map((item) => ({
            ...item,
            action: () => {
              setMenuTarget(null);
              item.action();
            },
          }))}
        />
      )}
    </div>
  );
}

function ChevronRightIcon() {
  return <ArrowRight size={16} aria-hidden="true" />;
}
function PanelHeading({
  title,
  icon,
  subtitle,
  tone = '',
  action,
}: {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  tone?: string;
  action?: ReactNode;
}) {
  return (
    <div className="sp-panel-heading">
      {icon && <span className={`sp-panel-icon ${tone}`}>{icon}</span>}
      <div>
        <h2>{title}</h2>
        {subtitle && (
          <small>
            <LockKeyhole size={11} />
            {subtitle}
          </small>
        )}
      </div>
      {action}
    </div>
  );
}
function HomeworkRow({ entry }: { entry: Entry }) {
  const status = entry.data.status;
  const pending = status === 'submitted';
  return (
    <article className="sp-homework-row">
      <span className="sp-work-icon">
        <FileText size={28} />
      </span>
      <div className="sp-work-info">
        <strong>{entry.data.title}</strong>
        <small>
          {entry.data.fileIds?.length ? `Файлов: ${entry.data.fileIds.length} · ` : ''}выдано{' '}
          {date(entry.created_at, { month: 'short', year: 'numeric' })}
        </small>
      </div>
      <span className={`sp-work-status ${status}`}>
        {pending ? (
          <Clock3 size={19} />
        ) : status === 'reviewed' ? (
          <CircleCheck size={19} />
        ) : (
          <FileText size={19} />
        )}
        {pending
          ? 'Ожидает проверки'
          : ['assigned', 'draft'].includes(status)
            ? 'Выдано'
            : statusLabels[status]}
      </span>
      <Link className="sp-text-button" to={`/homework/${entry.id}`}>
        {pending ? 'Проверить' : 'Открыть'}
        <ChevronRightIcon />
      </Link>
    </article>
  );
}

function ProfileMenu({
  target,
  actions,
  onClose,
}: {
  target: HTMLButtonElement;
  actions: { text: string; icon: typeof Pencil; action: () => void }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const menu = ref.current!;
    const reposition = () => {
      const box = target.getBoundingClientRect();
      if (box.bottom < 50 || box.top > innerHeight) {
        onClose();
        return;
      }
      setPosition({
        top: Math.max(12, Math.min(box.bottom + 7, innerHeight - menu.offsetHeight - 12)),
        left: Math.max(
          12,
          Math.min(box.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 12),
        ),
      });
    };
    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node) && !target.contains(e.target as Node)) onClose();
    };
    reposition();
    menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      if (menu.contains(document.activeElement)) target.focus({ preventScroll: true });
    };
  }, [target]);
  return createPortal(
    <div
      ref={ref}
      className="sp-menu"
      style={position}
      role="menu"
      aria-label="Действия с учеником"
      onKeyDown={(e) => {
        const items = [...ref.current!.querySelectorAll<HTMLButtonElement>('button')];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape' || e.key === 'Tab') onClose();
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          items[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? items.length - 1
                : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          ]?.focus();
        }
      }}
    >
      {actions.map(({ text, icon: Icon, action }) => (
        <button role="menuitem" key={text} onClick={action}>
          <Icon size={17} />
          {text}
        </button>
      ))}
    </div>,
    document.body,
  );
}
