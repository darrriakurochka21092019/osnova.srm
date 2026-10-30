import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  LockKeyhole,
  VideoOff,
  MicOff,
  ShieldCheck,
  CircleHelp,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import { Button, FormError } from '../ui';
import { Brand } from '../Brand';
import type { Classroom, LessonParticipant, LessonMessage } from '../../../../packages/contracts';

export { Brand };
export function AccessExpired({ message, retry }: { message?: string; retry?: () => void }) {
  return (
    <main className="lesson-entry lesson-access-page">
      <Link to="/" className="lesson-entry-brand">
        <Brand />
      </Link>
      <div className="lesson-ambient" aria-hidden="true" />
      <section className="lesson-access-card">
        <div className="lesson-lock-art">
          <LockKeyhole size={64} />
          <span>
            <Clock3 size={32} />
          </span>
        </div>
        <h1>{retry ? 'Не получилось открыть занятие' : 'Это приглашение недействительно'}</h1>
        <p>{message || 'Срок действия ссылки закончился или преподаватель отозвал доступ.'}</p>
        {!retry && <p>Попросите преподавателя прислать новую ссылку.</p>}
        {retry ? (
          <button className="btn btn-primary" onClick={retry}>
            Попробовать ещё раз
          </button>
        ) : (
          <Link className="btn btn-primary" to="/">
            Войти в свой кабинет
          </Link>
        )}
        <Link to="/" className="lesson-access-home">
          Вернуться на главную
        </Link>
        <div className="lesson-access-help">
          <CircleHelp size={22} />
          <span>Нужна помощь? Обратитесь к преподавателю.</span>
        </div>
      </section>
    </main>
  );
}
export function NoVideo({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <div className={`lesson-no-video ${large ? 'large' : ''}`}>
      <span className="lesson-video-label">{large ? 'Вы' : name}</span>
      <div className="lesson-video-orbit" aria-hidden="true" />
      <div className="lesson-video-person">
        <span>
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((n) => n[0])
            .join('')
            .toUpperCase()}
        </span>
      </div>
      <div className="lesson-video-stub">
        <VideoOff size={large ? 26 : 18} />
        <strong>Место для видеосвязи</strong>
        <small>Будет доступна позже</small>
      </div>
      {large && (
        <div className="lesson-preview-switches">
          <button disabled aria-label="Микрофон пока недоступен">
            <MicOff size={25} />
          </button>
          <button disabled aria-label="Камера пока недоступна">
            <VideoOff size={25} />
          </button>
        </div>
      )}
    </div>
  );
}
export function VideoNotice() {
  return (
    <div className="lesson-video-notice">
      <ShieldCheck size={17} />
      <span>Сейчас работаем на общей доске. Камера, микрофон и запись не включаются.</span>
    </div>
  );
}
export function ElapsedTime({ start }: { start?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [start]);
  const seconds = start ? Math.max(0, Math.floor((now - new Date(start).getTime()) / 1000)) : 0;
  return (
    <span>
      {start
        ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
        : 'Подготовка'}
    </span>
  );
}
export function useClassroom(id: string, stage: 'lobby' | 'lesson' = 'lobby', lessonId?: string) {
  const { user } = useApp();
  const [room, setRoom] = useState<Classroom | null>(null),
    [error, setError] = useState('');
  const [messages, setMessages] = useState<LessonMessage[]>([]);
  const socket = useRef<ReturnType<typeof io> | null>(null);
  const name =
    sessionStorage.getItem(`lesson-name:${id}`) ||
    (user.role === 'teacher' ? 'Преподаватель' : user.name);
  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([
        api<Classroom>(`/classrooms/${id}${lessonId ? `?lessonId=${lessonId}` : ''}`),
        api<LessonMessage[]>(`/classrooms/${id}/messages`),
      ]);
      setRoom(r);
      setMessages((list) => mergeMessages(list, m));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, lessonId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const s = io({ withCredentials: true });
    socket.current = s;
    s.on('connect', () =>
      s.emit('join-classroom', { roomId: id, stage, name }, (r: any) => {
        if (r?.error) setError(r.error);
      }),
    );
    s.on(
      'classroom-state',
      (state: { participants: LessonParticipant[]; activeSession: Classroom['activeSession'] }) => {
        setRoom((r) => (r ? { ...r, ...state } : r));
      },
    );
    s.on('classroom-permission', () => void load());
    s.on('classroom-message', (m: LessonMessage) =>
      setMessages((list) => mergeMessages(list, [m])),
    );
    s.on('access-revoked', () =>
      setError('Доступ к занятию закрыт. Откройте актуальную ссылку преподавателя.'),
    );
    return () => {
      s.disconnect();
      socket.current = null;
    };
  }, [id, stage, user.id, load]);
  return { room, setRoom, error, load, socket, name, messages, setMessages };
}
export function mergeMessages(before: LessonMessage[], after: LessonMessage[]) {
  return [...new Map([...before, ...after].map((m) => [m.id, m])).values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}
export function BackToCabinet({ guest = false }: { guest?: boolean }) {
  return (
    <Link className="lesson-back" to={guest ? '/lessons' : '/'}>
      <ArrowLeft size={21} />
      {guest ? 'К моим занятиям' : 'Вернуться в кабинет'}
    </Link>
  );
}
export async function copyLessonLink(link: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(link);
    return;
  }
  const input = document.createElement('textarea');
  input.value = link;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Не удалось скопировать ссылку. Скопируйте её из поля вручную.');
}
export function PersonalRoomLinks({ room }: { room: Classroom }) {
  const { toast } = useApp();
  const [error, setError] = useState('');
  return (
    <div className="lesson-personal-links">
      <p className="muted">
        У каждого ученика своя постоянная ссылка. Она автоматически приведёт его в эту мини-группу к
        началу занятия.
      </p>
      {room.memberLinks?.map((link) => (
        <div className="lesson-personal-link" key={link.studentId}>
          <strong>{link.name}</strong>
          <input
            aria-label={`Ссылка: ${link.name}`}
            readOnly
            value={link.url}
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="secondary"
            disabled={!link.active}
            onClick={async () => {
              try {
                await copyLessonLink(link.url);
                toast(`Ссылка для ${link.name} скопирована`);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Скопировать ссылку
          </Button>
        </div>
      ))}
      <FormError error={error} />
    </div>
  );
}
