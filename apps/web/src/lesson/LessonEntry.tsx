import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  MicOff,
  Play,
  VideoOff,
} from 'lucide-react';
import type { Classroom, User } from '../../../../packages/contracts';
import { api, date } from '../api';
import { Avatar, Busy, Button, Field, FormError } from '../ui';
import { useApp } from '../store';
import { AccessExpired, BackToCabinet, Brand, NoVideo, VideoNotice, useClassroom } from './shared';

function EntryLayout({
  room,
  user,
  name,
  setName,
  waiting,
  busy,
  error,
  onJoin,
  onPrepare,
}: {
  room: Classroom;
  user: User | null;
  name: string;
  setName: (n: string) => void;
  waiting?: boolean;
  busy: boolean;
  error: string;
  onJoin: () => void;
  onPrepare?: () => void;
}) {
  const teacher = user?.id === room.owner_id,
    others = room.participants.filter((p) => p.id !== user?.id);
  const person = teacher
    ? others.find((p) => p.role !== 'teacher')
    : others.find((p) => p.role === 'teacher');
  const lesson = room.lesson;
  return (
    <main className="lesson-entry">
      <header className="lesson-entry-header">
        <Link to="/">
          <Brand />
        </Link>
        <BackToCabinet guest={user?.role === 'guest'} />
      </header>
      <div className="lesson-entry-grid">
        <section className="lesson-device-card">
          <NoVideo name={name || 'Вы'} large />
          <div className="lesson-device-fields">
            <div>
              <label>
                <MicOff size={18} />
                Микрофон
              </label>
              <div className="lesson-device-disabled">Будет доступен с видеосвязью</div>
            </div>
            <div>
              <label>
                <VideoOff size={18} />
                Камера
              </label>
              <div className="lesson-device-disabled">Будет доступна с видеосвязью</div>
            </div>
          </div>
          <VideoNotice />
        </section>
        <section className="lesson-ready-card">
          <span className="lesson-subject">
            <BookOpen size={26} />
            {lesson?.data.subject || room.students[0]?.subject || 'Учебное занятие'}
          </span>
          <h1>
            {waiting
              ? 'Ожидаем преподавателя'
              : room.activeSession
                ? 'Урок уже начался'
                : 'Готовы начать?'}
          </h1>
          <div className="lesson-ready-student">
            <Avatar name={room.students[0]?.name || room.title} />
            <div>
              <span>
                {room.kind === 'group'
                  ? `${room.students.length} ученика · мини-группа`
                  : `${room.students[0]?.name} · ${room.students[0]?.grade || 'индивидуально'}`}
              </span>
              <h2>{lesson?.data.title || 'Индивидуальное занятие'}</h2>
            </div>
          </div>
          <div className="lesson-ready-time">
            <CalendarDays size={23} />
            <span>
              {lesson
                ? `${date(lesson.data.start, { year: 'numeric', hour: '2-digit', minute: '2-digit' })} МСК`
                : 'Вне расписания · комната готова'}
            </span>
          </div>
          <div className={`lesson-presence-note ${person ? 'online' : ''}`}>
            <span />
            {person
              ? `${person.name} ${person.stage === 'lesson' ? 'уже на уроке' : 'уже в комнате'}`
              : waiting
                ? 'Преподаватель скоро начнёт занятие'
                : teacher
                  ? 'Ученик сможет войти по своей постоянной ссылке'
                  : 'Преподаватель пока не вошёл в комнату'}
          </div>
          <div className="lesson-entry-form">
            <Field label="Как вас видят участники">
              <input
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={waiting}
                autoComplete="name"
              />
            </Field>
            <FormError error={error} />
            <Button
              className="lesson-join-button"
              disabled={busy || !name.trim() || waiting}
              onClick={onJoin}
            >
              {busy || waiting ? <LoaderCircle className="spin" size={22} /> : <Play size={22} />}
              <span>{waiting ? 'Ждём начала урока' : 'Войти на урок'}</span>
            </Button>
            {onPrepare && (
              <button className="lesson-board-only" onClick={onPrepare}>
                Открыть только доску
              </button>
            )}
            {waiting && (
              <p className="lesson-waiting-caption">
                Вы попадёте на общую доску автоматически, когда преподаватель начнёт занятие.
              </p>
            )}
          </div>
          <p className="lesson-ready-foot">
            <Check size={17} />
            Доска и материалы сохраняются между занятиями
          </p>
        </section>
      </div>
    </main>
  );
}

export default function PublicLessonEntry({
  user,
  onLogin,
}: {
  user: User | null;
  onLogin: () => Promise<void>;
}) {
  const { id = '' } = useParams(),
    navigate = useNavigate();
  const [secret] = useState(() => window.location.hash.slice(1)),
    [room, setRoom] = useState<Classroom | null>(null),
    [error, setError] = useState(''),
    [invalid, setInvalid] = useState(false),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(user?.role === 'teacher' ? 'Преподаватель' : user?.name || '');
  const load = async () => {
    try {
      const result = secret
        ? await api<Classroom>('/classrooms/preview', { roomId: id, token: secret })
        : user
          ? await api<Classroom>(`/classrooms/${id}`)
          : null;
      if (!result) {
        setInvalid(true);
        return;
      }
      setRoom(result);
      setName(
        (n) =>
          n ||
          result.students.find((s) => s.id === result.entryStudentId)?.name ||
          result.students[0]?.name ||
          'Ученик',
      );
      setError('');
      setInvalid(false);
    } catch (e) {
      setError((e as Error).message);
      setInvalid([400, 404, 410].includes((e as any).status));
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [id, secret, user?.id]);
  if (invalid) return <AccessExpired message={error || undefined} />;
  if (!room) return error ? <AccessExpired message={error} retry={() => void load()} /> : <Busy />;
  return (
    <EntryLayout
      room={room}
      user={user}
      name={name}
      setName={setName}
      busy={busy}
      error={error}
      onJoin={async () => {
        setBusy(true);
        setError('');
        try {
          const result = secret
            ? await api('/classrooms/redeem', { roomId: id, token: secret, name })
            : { roomId: room.id };
          await onLogin();
          sessionStorage.setItem(`lesson-name:${result.roomId}`, name);
          const joined = await api(`/classrooms/${result.roomId}/join`, {
            name,
            ...(room.lesson ? { lessonId: room.lesson.id } : {}),
          });
          navigate(
            joined.session
              ? `/lesson/${result.roomId}/live/${joined.session.id}`
              : `/lesson/${result.roomId}?waiting=1`,
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function LessonLobby() {
  const { id = '' } = useParams(),
    [search] = useSearchParams(),
    navigate = useNavigate(),
    { user } = useApp();
  const {
    room,
    error: loadError,
    socket,
    name: initialName,
  } = useClassroom(id, 'lobby', search.get('lesson') || undefined);
  const [name, setName] = useState(initialName),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const waiting = search.get('waiting') === '1';
  useEffect(() => {
    if (waiting && room?.activeSession)
      navigate(`/lesson/${id}/live/${room.activeSession.id}`, { replace: true });
  }, [waiting, room?.activeSession?.id, id]);
  if (loadError) return <AccessExpired message={loadError} />;
  if (!room) return <Busy />;
  return (
    <EntryLayout
      room={room}
      user={user}
      name={name}
      setName={setName}
      waiting={waiting}
      busy={busy}
      error={error}
      onPrepare={
        user.id === room.owner_id
          ? () => navigate(`/lesson/${id}/prepare${room.lesson ? `?lesson=${room.lesson.id}` : ''}`)
          : undefined
      }
      onJoin={async () => {
        setBusy(true);
        setError('');
        try {
          sessionStorage.setItem(`lesson-name:${id}`, name);
          socket.current?.emit('join-classroom', { roomId: id, stage: 'lobby', name });
          const result = await api(`/classrooms/${id}/join`, {
            name,
            ...(room.lesson ? { lessonId: room.lesson.id } : {}),
          });
          navigate(
            result.session ? `/lesson/${id}/live/${result.session.id}` : `/lesson/${id}?waiting=1`,
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
