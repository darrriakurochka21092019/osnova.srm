import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  LockKeyhole,
  Pencil,
  Send,
} from 'lucide-react';
import type { Asset, Classroom, Entry, LessonSession } from '../../../../packages/contracts';
import { io } from 'socket.io-client';
import { api, date, fileUrl, fromLocalInput, localInput } from '../api';
import { useApp } from '../store';
import { Badge, Busy, Button, Field, FormError, PageHead } from '../ui';

export default function LessonSummary() {
  const { id = '', sessionId = '' } = useParams(),
    { user, records, refresh, toast } = useApp(),
    navigate = useNavigate();
  const [room, setRoom] = useState<Classroom | null>(null),
    [session, setSession] = useState<LessonSession | null>(null),
    [lesson, setLesson] = useState<Entry | null>(null),
    [files, setFiles] = useState<Asset[]>([]),
    [summary, setSummary] = useState(''),
    [note, setNote] = useState(''),
    [homework, setHomework] = useState({
      title: '',
      description: '',
      due: localInput(new Date(Date.now() + 86400000)),
    }),
    [assign, setAssign] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const load = async () => {
    try {
      const [r, s] = await Promise.all([
        api<Classroom>(`/classrooms/${id}`),
        api(`/classrooms/${id}/sessions/${sessionId}`),
      ]);
      if (!s.session.ended_at) {
        navigate(`/lesson/${id}/live/${sessionId}`, { replace: true });
        return;
      }
      setRoom(r);
      setSession(s.session);
      setLesson(s.lesson);
      setSummary(s.session.summary);
      setNote(s.session.private_note || '');
      const materials = await api(`/classrooms/${id}/sessions/${sessionId}/materials`);
      setFiles(materials.files);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [id, sessionId]);
  useEffect(() => {
    if (!room || room.owner_id === user.id) return;
    const socket = io({ withCredentials: true });
    socket.on('connect', () =>
      socket.emit('join-classroom', { roomId: id, stage: 'lobby', name: user.name }),
    );
    socket.on('classroom-summary', (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) void load();
    });
    return () => {
      socket.disconnect();
    };
  }, [room?.id, user.id, sessionId]);
  if (!room || !session || !lesson)
    return error ? (
      <div className="panel">
        <FormError error={error} />
        <Link to="/lessons">К занятиям</Link>
      </div>
    ) : (
      <Busy />
    );
  const teacher = room.owner_id === user.id;
  const elapsed = Math.max(
    0,
    Math.round(
      (new Date(session.ended_at || Date.now()).getTime() -
        new Date(session.started_at).getTime()) /
        60000,
    ),
  );
  const assigned = records.homework.filter((h) => session.homework_ids.includes(h.id));
  const materials = files.filter((f) => !f.excalidraw_id);
  const save = async (withHomework = false) => {
    setBusy(true);
    setError('');
    try {
      const result = await api<LessonSession>(
        `/classrooms/${id}/sessions/${sessionId}/summary`,
        {
          summary,
          privateNote: note,
          ...(withHomework ? { homework: { ...homework, due: fromLocalInput(homework.due) } } : {}),
        },
        'PATCH',
      );
      setSession(result);
      setAssign(false);
      await refresh();
      toast(withHomework ? 'Домашнее задание назначено' : 'Итоги урока сохранены');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lesson-summary">
      <Link className="text-link back-link" to="/lessons">
        <ArrowLeft size={17} />
        Мои занятия
      </Link>
      <section className="lesson-summary-hero">
        <div className="lesson-summary-check">
          <CheckCircle2 size={50} />
        </div>
        <div>
          <h1>Урок завершён</h1>
          <p>
            {room.students.map((s) => s.name).join(', ')} ·{' '}
            {date(session.started_at, { hour: '2-digit', minute: '2-digit' })} МСК
          </p>
          <div>
            <span>
              <Clock3 size={17} />
              {elapsed ? `${elapsed} мин.` : 'Меньше минуты'}
            </span>
            <span>
              <FileText size={17} />
              Общий учебный холст
            </span>
            <span>
              <CheckCircle2 size={17} />
              Материалы сохранены
            </span>
          </div>
        </div>
      </section>
      <FormError error={error} />
      <div className="lesson-summary-grid">
        <div>
          <section className="panel lesson-summary-topics">
            <div className="section-heading">
              <h2>Что прошли</h2>
              {teacher && (
                <span>
                  <Pencil size={15} />
                  Можно дополнить
                </span>
              )}
            </div>
            <h3>{lesson.data.title}</h3>
            {teacher ? (
              <>
                <textarea
                  aria-label="Что прошли на уроке"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Запишите темы и результаты занятия — каждую мысль с новой строки."
                  rows={5}
                />
                <Button variant="secondary" disabled={busy} onClick={() => void save()}>
                  <Check size={16} />
                  Сохранить итоги
                </Button>
              </>
            ) : summary ? (
              <ul>
                {summary
                  .split('\n')
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i}>
                      <Check size={17} />
                      {line}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="muted">Преподаватель добавит итоги занятия.</p>
            )}
          </section>
          <section className="panel lesson-summary-materials">
            <div className="section-heading">
              <h2>Материалы урока</h2>
              <Link to={`/lesson/${id}/materials/${sessionId}`}>
                Открыть <ArrowRight size={15} />
              </Link>
            </div>
            <Link className="lesson-saved-board" to={`/lesson/${id}/materials/${sessionId}`}>
              <div>
                <BookOpen size={34} />
                <span />
                <span />
                <span />
              </div>
              <strong>{lesson.data.title}</strong>
              <small>Сохранённый холст в конце занятия</small>
              <span className="lesson-saved-badge">
                <Check size={14} />
                Сохранено
              </span>
            </Link>
            {materials.map((f) => (
              <a className="lesson-summary-file" href={fileUrl(f.id, true)} key={f.id}>
                <span className="lesson-file-icon">
                  <FileText size={24} />
                </span>
                <div>
                  <strong>{f.name}</strong>
                  <small>
                    {f.mime === 'application/pdf' ? 'PDF' : 'Изображение'} ·{' '}
                    {(f.size / 1024 / 1024).toFixed(1)} МБ
                  </small>
                </div>
                <Download size={20} />
              </a>
            ))}
            {!materials.length && (
              <p className="muted">
                Все тексты, рисунки и пометки находятся на сохранённом холсте.
              </p>
            )}
          </section>
        </div>
        <div>
          <section className="panel lesson-summary-homework">
            <h2>Домашнее задание</h2>
            {assigned.length ? (
              <div className="lesson-summary-assigned">
                {assigned.map((h) => (
                  <Link to={`/homework/${h.id}`} key={h.id}>
                    <span className="lesson-file-icon peach">
                      <FileText size={23} />
                    </span>
                    <div>
                      <strong>{h.data.title}</strong>
                      <small>
                        До {date(h.data.due, { hour: '2-digit', minute: '2-digit' })} МСК
                      </small>
                    </div>
                    <ArrowRight size={17} />
                  </Link>
                ))}
              </div>
            ) : session.homework_ids.length ? (
              <p>Домашнее задание назначено. Оно доступно в личном кабинете ученика.</p>
            ) : (
              <p className="muted">
                {teacher
                  ? 'Закрепите материал: задание появится в кабинете ученика.'
                  : 'Преподаватель может назначить задание после занятия.'}
              </p>
            )}
            {teacher &&
              !session.homework_ids.length &&
              (assign ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(true);
                  }}
                >
                  <Field label="Название задания">
                    <input
                      required
                      maxLength={250}
                      value={homework.title}
                      onChange={(e) => setHomework({ ...homework, title: e.target.value })}
                      placeholder="Закрепить тему урока"
                    />
                  </Field>
                  <Field label="Что нужно сделать">
                    <textarea
                      required
                      rows={4}
                      value={homework.description}
                      onChange={(e) => setHomework({ ...homework, description: e.target.value })}
                    />
                  </Field>
                  <Field label="Сдать до · МСК">
                    <input
                      required
                      type="datetime-local"
                      value={homework.due}
                      onChange={(e) => setHomework({ ...homework, due: e.target.value })}
                    />
                  </Field>
                  <Button disabled={busy} type="submit">
                    <Send size={17} />
                    Назначить задание
                  </Button>
                </form>
              ) : (
                <Button onClick={() => setAssign(true)}>
                  <Send size={17} />
                  Назначить задание
                </Button>
              ))}
          </section>
          {teacher && (
            <section className="panel lesson-summary-note">
              <h2>Заметка для себя</h2>
              <textarea
                aria-label="Личная заметка к следующему уроку"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={5}
                placeholder="Что повторить или подготовить к следующему занятию"
              />
              <p>
                <LockKeyhole size={15} />
                Видно только вам
              </p>
              <Button variant="secondary" disabled={busy} onClick={() => void save()}>
                Сохранить заметку
              </Button>
            </section>
          )}
          {room.lesson && room.lesson.id !== lesson.id && (
            <section className="panel lesson-summary-next">
              <h3>Следующее занятие</h3>
              <strong>{room.lesson.data.title}</strong>
              <p>
                <CalendarDays size={17} />
                {date(room.lesson.data.start, {
                  weekday: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                МСК
              </p>
              <Link to={`/lesson/${id}`}>
                Перейти в комнату <ArrowRight size={16} />
              </Link>
            </section>
          )}
          <div className="lesson-summary-actions">
            <Link className="btn btn-secondary" to={user.role === 'guest' ? '/lessons' : '/'}>
              <ArrowLeft size={17} />
              Вернуться в кабинет
            </Link>
            <Link className="btn btn-secondary" to={`/lesson/${id}/materials/${sessionId}`}>
              <BookOpen size={17} />
              Материалы урока
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
