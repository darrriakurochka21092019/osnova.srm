import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Plus,
  Play,
  Users,
  X,
} from 'lucide-react';
import type { Entry, Student } from '../../../../packages/contracts';
import { api, date, localInput, statusLabels, todayKey } from '../api';
import { useApp } from '../store';
import { Avatar, Button, FormError } from '../ui';
import { EntryEditor } from './editors';
import { LessonDialog } from './workspace';
import { dayKey, HOUR_HEIGHT, layoutDayEvents, lessonEnd, moscowDay } from './schedule-layout';
import './schedule.css';

type Mode = 'day' | 'week' | 'month';
const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const timeOf = (value: string | Date) => localInput(value).slice(11, 16);
const isGroup = (entry: Entry) =>
  new Set([entry.student_id, ...(entry.data.studentIds || [])].filter(Boolean)).size > 1;
const pupilLabel = (entry: Entry, students: Student[]) => {
  if (isGroup(entry)) return 'Мини-группа';
  const pupil = students.find(
    (student) => student.id === (entry.student_id || entry.data.studentIds?.[0]),
  );
  return pupil ? `${pupil.name}${pupil.grade ? ` · ${pupil.grade}` : ''}` : 'Урок без ученика';
};
const eventClass = (entry: Entry) => `${entry.data.status} ${isGroup(entry) ? 'group' : ''}`;
const eventLabel = (entry: Entry, students: Student[]) =>
  `${timeOf(entry.data.start)}–${timeOf(new Date(lessonEnd(entry)))}, ${pupilLabel(entry, students)}, ${entry.data.title}, ${statusLabels[entry.data.status]}`;

function periodLabel(days: Date[], mode: Mode) {
  if (mode === 'month') return date(days[0], { day: undefined, month: 'long', year: 'numeric' });
  if (mode === 'day') return date(days[0], { weekday: 'long', year: 'numeric' });
  const first = days[0],
    last = days[6];
  const from = date(first, {
    month: first.getUTCMonth() === last.getUTCMonth() ? undefined : 'long',
    year: first.getUTCFullYear() !== last.getUTCFullYear() ? 'numeric' : undefined,
  });
  return `${from} — ${date(last)} ${last.getUTCFullYear()}`;
}

export function SchedulePage() {
  const { records, user, students } = useApp();
  const [anchor, setAnchor] = useState(todayKey());
  const [mode, setMode] = useState<Mode>('week');
  const [sid, setSid] = useState('');
  const [create, setCreate] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [detail, setDetail] = useState<Entry | null>(null);
  const [selected, setSelected] = useState<{ id: string; target: HTMLButtonElement } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const today = localInput(now).slice(0, 10);
  const d = new Date(`${anchor}T12:00:00Z`);
  const first = new Date(d);
  if (mode === 'week') first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  if (mode === 'month') first.setUTCDate(1);
  const count =
    mode === 'day'
      ? 1
      : mode === 'week'
        ? 7
        : new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate();
  const days = Array.from({ length: count }, (_, i) => {
    const day = new Date(first);
    day.setUTCDate(day.getUTCDate() + i);
    return day;
  });
  const periodStart = moscowDay(dayKey(days[0]));
  const periodEnd = moscowDay(dayKey(days.at(-1)!)) + 86_400_000;
  const lessons = records.lesson
    .filter(
      (entry) =>
        (!sid || entry.student_id === sid || entry.data.studentIds?.includes(sid)) &&
        new Date(entry.data.start).getTime() < periodEnd &&
        lessonEnd(entry) > periodStart,
    )
    .sort((a, b) => a.data.start.localeCompare(b.data.start));
  const selectedEntry = selected ? records.lesson.find((entry) => entry.id === selected.id) : null;
  const dailyLayouts = days.map((day) => layoutDayEvents(lessons, dayKey(day)));
  const visibleStarts = dailyLayouts.flatMap((events) => events.map((event) => event.start));
  const initialMinute = visibleStarts.length ? Math.min(...visibleStarts) : 16 * 60;
  useLayoutEffect(() => {
    if (!scroller.current) return;
    if (mode === 'month') {
      scroller.current.scrollTop = 0;
      return;
    }
    scroller.current.scrollTop =
      (Math.max(0, Math.min(18 * 60, initialMinute - 150)) / 60) * HOUR_HEIGHT;
  }, [anchor, mode, sid]);

  const changePeriod = (direction: number) => {
    const next = new Date(d);
    if (mode === 'month') {
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + direction);
    } else next.setUTCDate(next.getUTCDate() + direction * (mode === 'week' ? 7 : 1));
    setAnchor(dayKey(next));
    setSelected(null);
  };
  const pick = (entry: Entry, target: HTMLButtonElement) => setSelected({ id: entry.id, target });
  const nowMinutes =
    Number(localInput(now).slice(11, 13)) * 60 + Number(localInput(now).slice(14, 16));
  const hasToday = days.some((day) => dayKey(day) === today);

  return (
    <div className="schedule-page">
      <div className="schedule-heading">
        <div>
          <h1>Расписание</h1>
          <p>Все занятия по московскому времени</p>
        </div>
        {user.role === 'teacher' && (
          <Button onClick={() => setCreate(true)}>
            <Plus size={23} />
            Добавить урок
          </Button>
        )}
      </div>
      <div className="schedule-toolbar">
        <div className="schedule-date-controls">
          <Button
            variant="secondary"
            onClick={() => {
              setAnchor(todayKey());
              setSelected(null);
            }}
          >
            Сегодня
          </Button>
          <div className="schedule-arrows">
            <button aria-label="Предыдущий период" onClick={() => changePeriod(-1)}>
              <ChevronLeft size={19} />
            </button>
            <button aria-label="Следующий период" onClick={() => changePeriod(1)}>
              <ChevronRight size={19} />
            </button>
          </div>
          <div className="schedule-period">
            <span aria-live="polite">{periodLabel(days, mode)}</span>
            <label className="schedule-date-picker" title="Выбрать дату">
              <CalendarDays size={18} aria-hidden="true" />
              <input
                type="date"
                aria-label="Выбрать дату"
                value={anchor}
                onChange={(e) => {
                  if (e.target.value) {
                    setAnchor(e.target.value);
                    setSelected(null);
                  }
                }}
              />
            </label>
          </div>
        </div>
        <div className="schedule-view-controls">
          <div className="schedule-modes" role="group" aria-label="Вид расписания">
            {(
              [
                ['day', 'День'],
                ['week', 'Неделя'],
                ['month', 'Месяц'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setSelected(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {user.role === 'teacher' && (
            <div className="schedule-filter">
              <Users size={22} aria-hidden="true" />
              <select
                aria-label="Ученики в расписании"
                value={sid}
                onChange={(e) => {
                  setSid(e.target.value);
                  setSelected(null);
                }}
              >
                <option value="">Все ученики</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={17} aria-hidden="true" />
            </div>
          )}
        </div>
      </div>

      <div
        className={`schedule-calendar ${mode === 'month' ? 'schedule-month' : ''}`}
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label="Календарь занятий"
      >
        {mode === 'month' ? (
          <div className="schedule-month-grid">
            {weekdays.map((name) => (
              <div className="schedule-month-weekday" key={name}>
                {name}
              </div>
            ))}
            {Array.from({ length: (days[0].getUTCDay() + 6) % 7 }, (_, i) => (
              <div className="schedule-month-blank" key={`blank-${i}`} />
            ))}
            {days.map((day, index) => (
              <div
                className={`schedule-month-day ${dayKey(day) === today ? 'is-today' : ''}`}
                key={dayKey(day)}
              >
                <button
                  className="schedule-month-number"
                  aria-label={`Открыть день: ${date(day)}`}
                  onClick={() => {
                    setAnchor(dayKey(day));
                    setMode('day');
                    setSelected(null);
                  }}
                >
                  {day.getUTCDate()}
                </button>
                {dailyLayouts[index].map(({ entry }) => (
                  <button
                    key={entry.id}
                    className={`month-event ${eventClass(entry)}`}
                    aria-label={eventLabel(entry, students)}
                    onClick={(e) => pick(entry, e.currentTarget)}
                  >
                    <small>{timeOf(entry.data.start)}</small>
                    <strong>{pupilLabel(entry, students)}</strong>
                    <span>{entry.data.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`schedule-time-grid ${mode === 'day' ? 'schedule-day-view' : ''}`}
            style={{ '--day-count': days.length } as CSSProperties}
          >
            <div className="schedule-grid-heading">
              <div className="schedule-zone" title="Московское время">
                МСК
              </div>
              {days.map((day) => (
                <button
                  key={dayKey(day)}
                  className={`schedule-day-heading ${dayKey(day) === today ? 'is-today' : ''}`}
                  onClick={() => {
                    setAnchor(dayKey(day));
                    setSelected(null);
                  }}
                  aria-label={`Выбрать день: ${date(day)}`}
                  aria-current={dayKey(day) === today ? 'date' : undefined}
                >
                  <strong>{weekdays[(day.getUTCDay() + 6) % 7]}</strong>
                  <span>{date(day, { month: 'short' }).replace('.', '')}</span>
                </button>
              ))}
            </div>
            <div className="schedule-grid-body">
              <div className="schedule-time-rail">
                {Array.from({ length: 24 }, (_, hour) => (
                  <span key={hour} style={{ top: hour * HOUR_HEIGHT }}>
                    {String(hour).padStart(2, '0')}:00
                  </span>
                ))}
              </div>
              {days.map((day, index) => (
                <div
                  className={`schedule-day-column ${dayKey(day) === today ? 'is-today' : ''}`}
                  key={dayKey(day)}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span
                      className="schedule-hour-line"
                      key={hour}
                      style={{ top: hour * HOUR_HEIGHT }}
                      aria-hidden="true"
                    />
                  ))}
                  {dailyLayouts[index].map(({ entry, start, end, column, columns }) => (
                    <button
                      key={entry.id}
                      className={`calendar-event ${eventClass(entry)} ${selected?.id === entry.id ? 'is-selected' : ''} ${end - start < 45 ? 'is-compact' : ''}`}
                      aria-label={eventLabel(entry, students)}
                      aria-haspopup="dialog"
                      aria-expanded={selected?.id === entry.id}
                      style={{
                        top: (start / 60) * HOUR_HEIGHT,
                        height: Math.max(19, ((end - start) / 60) * HOUR_HEIGHT - 3),
                        left: `calc(${(column / columns) * 100}% + 4px)`,
                        width: `calc(${100 / columns}% - 8px)`,
                      }}
                      onClick={(e) => pick(entry, e.currentTarget)}
                    >
                      <div className="schedule-event-top">
                        <small>
                          {timeOf(entry.data.start)}–{timeOf(new Date(lessonEnd(entry)))}
                        </small>
                        {['rescheduled', 'cancelled', 'live', 'completed'].includes(
                          entry.data.status,
                        ) && <em>{statusLabels[entry.data.status]}</em>}
                      </div>
                      <strong>{pupilLabel(entry, students)}</strong>
                      <span>{entry.data.title}</span>
                    </button>
                  ))}
                </div>
              ))}
              {hasToday && (
                <div
                  className="schedule-now"
                  style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                  aria-label={`Сейчас ${timeOf(now)} МСК`}
                >
                  <span>{timeOf(now)}</span>
                  <i />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="schedule-legend" aria-label="Обозначения занятий">
        <span>
          <i className="individual" />
          Индивидуальный урок
        </span>
        <span>
          <i className="group" />
          Мини-группа
        </span>
        <span>
          <i className="rescheduled" />
          Перенесён
        </span>
        <span>
          <i className="cancelled" />
          Отменён
        </span>
      </div>
      {!lessons.length && (
        <div className="schedule-empty" role="status">
          <CalendarDays size={21} />
          <div>
            <strong>Занятий пока нет</strong>
            <span>
              Выберите другую дату
              {user.role === 'teacher'
                ? ' или добавьте первый урок.'
                : ' — здесь появятся запланированные уроки.'}
            </span>
          </div>
        </div>
      )}

      {selected && selectedEntry && (
        <SchedulePopover
          entry={selectedEntry}
          target={selected.target}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selectedEntry);
            setSelected(null);
          }}
          onDetails={() => {
            setDetail(selectedEntry);
            setSelected(null);
          }}
        />
      )}
      {create && (
        <EntryEditor
          kind="lesson"
          preset={{ start: `${anchor}T16:00` }}
          onClose={() => setCreate(false)}
        />
      )}
      {editing && <EntryEditor kind="lesson" entry={editing} onClose={() => setEditing(null)} />}
      {detail && <LessonDialog entry={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function SchedulePopover({
  entry,
  target,
  onClose,
  onEdit,
  onDetails,
}: {
  entry: Entry;
  target: HTMLButtonElement;
  onClose: () => void;
  onEdit: () => void;
  onDetails: () => void;
}) {
  const { students, user, refresh, studentName } = useApp();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pupil = students.find(
    (student) => student.id === (entry.student_id || entry.data.studentIds?.[0]),
  );
  useLayoutEffect(() => {
    const popup = ref.current!;
    const scrollParent = target.closest('.schedule-calendar');
    const reposition = () => {
      const box = target.getBoundingClientRect();
      const calendar = scrollParent?.getBoundingClientRect();
      const headingHeight =
        scrollParent
          ?.querySelector('.schedule-grid-heading, .schedule-month-weekday')
          ?.getBoundingClientRect().height || 0;
      if (
        calendar &&
        (box.bottom <= Math.max(0, calendar.top + headingHeight) ||
          box.top >= calendar.bottom ||
          box.right <= calendar.left ||
          box.left >= calendar.right)
      ) {
        onClose();
        return;
      }
      const width = popup.offsetWidth,
        height = popup.offsetHeight;
      const left = Math.max(
        12,
        Math.min(window.innerWidth - width - 12, box.left + Math.min(36, box.width / 2)),
      );
      const top =
        box.top - height - 12 > 65
          ? box.top - height - 12
          : Math.min(box.bottom + 12, window.innerHeight - height - 12);
      setPosition({ left, top: Math.max(12, top) });
    };
    reposition();
    popup.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (!popup.contains(e.target as Node) && !target.contains(e.target as Node)) onClose();
    };
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition);
    scrollParent?.addEventListener('scroll', reposition);
    const observer = new ResizeObserver(reposition);
    observer.observe(popup);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition);
      scrollParent?.removeEventListener('scroll', reposition);
      observer.disconnect();
      if (popup.contains(document.activeElement)) target.focus({ preventScroll: true });
    };
  }, [target, entry.id]);
  const enterLesson = async () => {
    setBusy(true);
    setError('');
    try {
      const room = await api(`/lessons/${entry.id}/classroom`, {});
      await refresh();
      const ended = room.sessions.find(
        (session: any) => session.lesson_id === entry.id && session.ended_at,
      );
      navigate(
        ended
          ? `/lesson/${room.id}/summary/${ended.id}`
          : entry.data.status === 'completed'
            ? `/board/${entry.data.materialBoardId || entry.data.boardId || room.board_id}`
            : `/lesson/${room.id}?lesson=${entry.id}`,
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div
      className="schedule-popover"
      role="dialog"
      aria-label={`Урок: ${entry.data.title}`}
      ref={ref}
      style={position}
    >
      <div className="schedule-popover-heading">
        <Avatar name={isGroup(entry) ? 'Мини группа' : pupil?.name || 'Урок'} />
        <div>
          <h2>{pupilLabel(entry, students)}</h2>
          <span>{entry.data.subject || pupil?.subject || 'Занятие'}</span>
        </div>
        <button className="icon-btn" aria-label="Закрыть карточку урока" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {isGroup(entry) && (
        <p className="schedule-participants">
          <Users size={21} />
          <span>
            {[
              ...new Set(
                [entry.student_id, ...(entry.data.studentIds || [])].filter((id): id is string =>
                  Boolean(id),
                ),
              ),
            ]
              .map(studentName)
              .join(', ')}
          </span>
        </p>
      )}
      <p>
        <FileText size={21} />
        <span>{entry.data.title}</span>
      </p>
      <p>
        <Clock3 size={21} />
        <span>
          {entry.data.duration} минут ({timeOf(entry.data.start)}–
          {timeOf(new Date(lessonEnd(entry)))} МСК)
        </span>
      </p>
      {entry.data.status !== 'planned' && (
        <span className={`schedule-detail-status ${entry.data.status}`}>
          {statusLabels[entry.data.status]}
        </span>
      )}
      {entry.data.rescheduleRequest && (
        <p className="schedule-request">Запрос на перенос: {entry.data.rescheduleRequest}</p>
      )}
      <FormError error={error} />
      <div className="schedule-popover-actions">
        <Button
          onClick={enterLesson}
          disabled={
            busy ||
            entry.data.status === 'cancelled' ||
            (!entry.student_id && !entry.data.studentIds?.length)
          }
        >
          <Play size={20} />
          {busy
            ? 'Открываем…'
            : entry.data.status === 'completed'
              ? 'Итоги и материалы'
              : 'Открыть урок'}
        </Button>
        {user.role === 'teacher' && (
          <Button variant="secondary" onClick={onEdit}>
            Изменить
          </Button>
        )}
        {user.role === 'student' && (
          <Button variant="secondary" onClick={onDetails}>
            Подробнее
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}
