import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  Expand,
  FileText,
  Grid2X2,
  Hand,
  History,
  LoaderCircle,
  MessageSquare,
  MicOff,
  Minus,
  MoreHorizontal,
  PanelRightClose,
  PhoneOff,
  Plus,
  Send,
  Users,
  VideoOff,
  MonitorOff,
  X,
} from 'lucide-react';
import type { BoardBackground, LessonSession } from '../../../../packages/contracts';
import type {
  BoardControls,
  BoardPresentation,
  BoardToolState,
  EditorHandle,
  SaveState,
} from '../pages/BoardRoom';
import { api, date } from '../api';
import { useApp } from '../store';
import { Avatar, Badge, Busy, Button, Field, FormError, Modal } from '../ui';
import {
  AccessExpired,
  Brand,
  ElapsedTime,
  mergeMessages,
  NoVideo,
  PersonalRoomLinks,
  useClassroom,
} from './shared';
import BoardTools from '../board/BoardTools';
const BoardRoom = lazy(() => import('../pages/BoardRoom'));
export default function LessonWorkspace({
  mode = 'live',
}: {
  mode?: 'live' | 'prepare' | 'materials';
}) {
  const { id = '', sessionId } = useParams(),
    [search] = useSearchParams(),
    navigate = useNavigate(),
    { user, toast } = useApp();
  const {
    room,
    error: roomError,
    load,
    socket,
    name,
    messages,
    setMessages,
  } = useClassroom(id, mode === 'live' ? 'lesson' : 'lobby', search.get('lesson') || undefined);
  const editor = useRef<EditorHandle | null>(null),
    controls = useRef<BoardControls | null>(null),
    chatEnd = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false),
    [save, setSave] = useState<{ state: SaveState; error?: string }>({ state: 'saved' }),
    [tool, setTool] = useState<BoardToolState>({
      type: 'selection',
      color: '#252846',
      width: 2,
      zoom: 1,
      readOnly: false,
    }),
    [catalog, setCatalog] = useState<BoardPresentation[]>([]),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 1000),
    [chatOpen, setChatOpen] = useState(true),
    [more, setMore] = useState(false),
    [access, setAccess] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [chat, setChat] = useState(''),
    [sending, setSending] = useState(false),
    [snapshot, setSnapshot] = useState<{ scene: any[]; background: BoardBackground } | null>(null),
    [session, setSession] = useState<LessonSession | null>(null);
  const messageId = useRef<string | null>(null);
  const teacher = room?.owner_id === user.id,
    archive = mode === 'materials';
  useEffect(() => {
    setReady(false);
  }, [room?.board_id, room?.permission]);
  useEffect(() => {
    const q = matchMedia('(max-width:1000px)');
    const changed = () => {
      if (q.matches) setSidebar(false);
    };
    q.addEventListener('change', changed);
    return () => q.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    void api(`/classrooms/${id}/sessions/${sessionId}`)
      .then((data) => {
        setSession(data.session);
        if (mode === 'live' && data.session.ended_at)
          navigate(`/lesson/${id}/summary/${sessionId}`, { replace: true });
      })
      .catch((e) => setError(e.message));
  }, [id, sessionId, mode]);
  useEffect(() => {
    if (!archive || !sessionId) return;
    void api(`/classrooms/${id}/sessions/${sessionId}/materials`)
      .then(setSnapshot)
      .catch((e) => setError(e.message));
  }, [id, sessionId, archive]);
  useEffect(() => {
    if (ready && snapshot)
      void editor.current
        ?.preview(snapshot.scene, snapshot.background)
        .catch((e) => setError(e.message));
  }, [ready, snapshot]);
  useEffect(() => {
    const s = socket.current;
    if (!s) return;
    let mounted = true;
    const ended = async (data: { sessionId: string }) => {
      if (mode !== 'live') return;
      try {
        await editor.current?.flush();
      } catch (e) {
        if (mounted) setError((e as Error).message);
        return;
      }
      if (mounted) navigate(`/lesson/${id}/summary/${data.sessionId}`);
    };
    // A participant may miss the end event while offline. Recheck the exact session on reconnect.
    const recheck = () => {
      if (mode !== 'live' || !sessionId) return;
      void api(`/classrooms/${id}/sessions/${sessionId}`)
        .then((data) => {
          if (data.session.ended_at) void ended({ sessionId });
        })
        .catch(() => {});
    };
    s.on('classroom-ended', ended);
    s.on('connect', recheck);
    return () => {
      mounted = false;
      s.off('classroom-ended', ended);
      s.off('connect', recheck);
    };
  }, [socket, id, mode, sessionId]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, chatOpen]);
  const leave = async () => {
    setError('');
    try {
      if (controls.current?.isBusy()) throw new Error('Дождитесь загрузки материалов');
      await editor.current?.flush();
      navigate(user.role === 'guest' ? '/lessons' : '/');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const finish = async () => {
    if (!room) return;
    setBusy(true);
    setError('');
    try {
      if (controls.current?.isBusy()) throw new Error('Дождитесь загрузки материалов');
      await editor.current?.flush();
      if (!editor.current?.isSaved())
        throw new Error('Дождитесь сохранения доски перед завершением урока');
      const current = room.activeSession || session;
      if (mode === 'prepare') {
        const joined = await api(`/classrooms/${id}/join`, {
          name,
          ...(room.lesson ? { lessonId: room.lesson.id } : {}),
        });
        navigate(`/lesson/${id}/live/${joined.session.id}`);
      } else if (teacher && current && !archive) {
        await api(`/classrooms/${id}/sessions/${current.id}/end`, {});
        navigate(`/lesson/${id}/summary/${current.id}`);
      } else await leave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (roomError) return <AccessExpired message={roomError} />;
  if (!room) return <Busy />;
  if (mode === 'prepare' && !teacher)
    return <AccessExpired message="Подготовка занятия доступна преподавателю." />;
  if (mode === 'live' && !room.activeSession && !session)
    return error ? (
      <AccessExpired message={error} retry={() => navigate(`/lesson/${id}`)} />
    ) : (
      <Busy />
    );
  const current = room.activeSession || session;
  const title = archive
    ? session?.title || 'Материалы занятия'
    : room.lesson?.data.title || current?.title || room.title;
  const people = room.participants;
  const expected = [
    { id: room.owner_id, studentId: undefined, name: 'Преподаватель', role: 'teacher' },
    ...room.students.map((s) => ({
      id: s.user_id,
      studentId: s.id,
      name: s.name,
      role: 'student',
    })),
  ];
  const shown = [
    ...people,
    ...expected
      .filter(
        (p) =>
          !people.some(
            (a) =>
              a.id === p.id ||
              (p.studentId && a.studentId === p.studentId) ||
              a.name === p.name ||
              a.name === p.name.split(' ')[0],
          ),
      )
      .map((p) => ({ ...p, stage: 'offline', handRaised: false })),
  ];
  return (
    <main
      className={`lesson-workspace ${sidebar ? 'with-sidebar' : ''} ${archive ? 'lesson-archive' : ''}`}
    >
      <header className="lesson-room-header">
        <Link
          to={user.role === 'guest' ? '/lessons' : '/'}
          onClick={(e) => {
            e.preventDefault();
            void leave();
          }}
        >
          <Brand />
        </Link>
        <span className="lesson-header-divider" />
        <button className="lesson-header-back" onClick={() => void leave()}>
          <ArrowLeft size={18} />
          <span>Кабинет</span>
        </button>
        <span className="lesson-header-divider" />
        <h1 title={title}>{title}</h1>
        <span className={`lesson-save ${save.state}`} role="status" title={save.error}>
          {save.state === 'saved' ? (
            <Check size={17} />
          ) : (
            <LoaderCircle className={save.state === 'saving' ? 'spin' : ''} size={17} />
          )}
          <span>
            {save.state === 'saved'
              ? 'Все изменения сохранены'
              : save.state === 'saving'
                ? 'Сохраняем изменения…'
                : save.state === 'offline'
                  ? 'Нет связи · пометки на устройстве'
                  : 'Не удалось сохранить'}
          </span>
        </span>
        <div className="lesson-header-avatars">
          {people.slice(0, 4).map((p) => (
            <Avatar key={p.id} name={p.name} small />
          ))}
        </div>
        {teacher && (
          <button className="lesson-link-button" onClick={() => setAccess(true)}>
            <Users size={18} />
            <span>Ссылка на занятие</span>
          </button>
        )}
        <button
          className="lesson-more-button icon-btn"
          aria-label="Меню урока"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          <MoreHorizontal size={22} />
        </button>
        {more && (
          <div className="lesson-more-menu">
            <button
              onClick={() => {
                controls.current?.export();
                setMore(false);
              }}
            >
              <Download size={17} />
              Скачать материалы
            </button>
            {teacher && !archive && (
              <button
                onClick={() => {
                  controls.current?.history();
                  setMore(false);
                }}
              >
                <History size={17} />
                История уроков
              </button>
            )}
            {!archive && (
              <button
                onClick={() => {
                  controls.current?.background();
                  setMore(false);
                }}
              >
                <Grid2X2 size={17} />
                Фон доски
              </button>
            )}
            <button
              onClick={() => {
                setSidebar((v) => !v);
                setMore(false);
              }}
            >
              <PanelRightClose size={17} />
              {sidebar ? 'Скрыть участников' : 'Показать участников'}
            </button>
          </div>
        )}
      </header>
      {error && (
        <div className="lesson-global-error" role="alert">
          <FormError error={error} />
          <button className="icon-btn" aria-label="Закрыть сообщение" onClick={() => setError('')}>
            <X size={18} />
          </button>
        </div>
      )}
      <div className="lesson-work-area">
        <section className="lesson-board-area" aria-label="Общая доска урока">
          <Suspense fallback={<Busy />}>
            <BoardRoom
              key={`${room.board_id}:${room.permission}:${archive}`}
              boardId={room.board_id}
              embedded
              editorRef={editor}
              controlsRef={controls}
              forceReadOnly={archive || room.permission === 'view'}
              onReady={() => setReady(true)}
              onSaveState={(state, error) =>
                setSave((old) =>
                  old.state === state && old.error === error ? old : { state, error },
                )
              }
              onTools={setTool}
              onPresentations={setCatalog}
            />
          </Suspense>
          <BoardTools
            editor={editor}
            tool={tool}
            ready={ready && !archive}
            upload={() => controls.current?.upload()}
          />
          <div className="lesson-canvas-zoom">
            <button aria-label="Уменьшить масштаб" onClick={() => editor.current?.zoomBy(-0.1)}>
              <Minus size={17} />
            </button>
            <span>{Math.round(tool.zoom * 100)}%</span>
            <button aria-label="Увеличить масштаб" onClick={() => editor.current?.zoomBy(0.1)}>
              <Plus size={17} />
            </button>
            <button
              aria-label="Показать весь холст"
              title="Показать весь холст"
              onClick={() => editor.current?.fit()}
            >
              <Expand size={18} />
            </button>
          </div>
        </section>
        <aside className="lesson-room-sidebar" aria-label="Участники и комментарии">
          <div className="lesson-sidebar-head">
            <strong>
              Участники <span>· {people.length}</span>
            </strong>
            <button
              className="icon-btn"
              aria-label="Скрыть панель участников"
              onClick={() => setSidebar(false)}
            >
              <PanelRightClose size={18} />
            </button>
          </div>
          <div className={`lesson-people ${chatOpen ? 'with-chat' : ''}`}>
            {shown.map((p) => (
              <div
                key={p.id}
                className={`lesson-person-card ${p.stage === 'offline' ? 'offline' : ''}`}
              >
                <NoVideo name={p.name} />
                <div className="lesson-person-state">
                  <span className={p.stage === 'offline' ? '' : 'online'} />
                  {p.stage === 'offline'
                    ? 'Ещё не в комнате'
                    : p.stage === 'lobby'
                      ? 'Готовится к занятию'
                      : 'На общей доске'}
                  {p.handRaised && <Hand size={18} className="lesson-raised-hand" />}
                </div>
              </div>
            ))}
          </div>
          <div className="lesson-session-time">
            <span className={mode === 'live' ? 'live' : ''} />
            <strong>{mode === 'live' ? 'Занятие · ' : archive ? 'Материалы · ' : ''}</strong>
            <ElapsedTime start={mode === 'live' ? current?.started_at : undefined} />
            <small>МСК</small>
          </div>
          <div className={`lesson-chat ${chatOpen ? 'open' : ''}`}>
            <button className="lesson-chat-title" onClick={() => setChatOpen((v) => !v)}>
              <MessageSquare size={20} />
              <strong>Комментарии</strong>
              <ChevronDown size={18} />
            </button>
            {chatOpen && (
              <>
                <div className="lesson-chat-messages" aria-live="polite">
                  {!messages.length && (
                    <p>Здесь можно задать вопрос или оставить важный комментарий к занятию.</p>
                  )}
                  {messages.map((m) => (
                    <div
                      className={`lesson-chat-message ${m.author_id === user.id ? 'own' : ''}`}
                      key={m.id}
                    >
                      <span>
                        {m.author_name}
                        <small>
                          {date(m.created_at, {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: undefined,
                            month: undefined,
                          })}
                        </small>
                      </span>
                      <p>{m.body}</p>
                    </div>
                  ))}
                  <div ref={chatEnd} />
                </div>
                <form
                  className="lesson-chat-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!chat.trim() || sending) return;
                    setSending(true);
                    setError('');
                    messageId.current ||= crypto.randomUUID();
                    try {
                      const m = await api(`/classrooms/${id}/messages`, {
                        id: messageId.current,
                        body: chat,
                        name,
                      });
                      setMessages((list) => mergeMessages(list, [m]));
                      setChat('');
                      messageId.current = null;
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setSending(false);
                    }
                  }}
                >
                  <input
                    aria-label="Комментарий к уроку"
                    value={chat}
                    maxLength={2000}
                    onChange={(e) => setChat(e.target.value)}
                    placeholder="Добавить комментарий…"
                  />
                  <button aria-label="Отправить комментарий" disabled={sending || !chat.trim()}>
                    <Send size={18} />
                  </button>
                </form>
              </>
            )}
          </div>
        </aside>
      </div>
      <footer className="lesson-room-footer">
        <div className="lesson-slides lesson-material-info">
          <FileText size={20} />
          <span>
            {archive
              ? 'Материалы занятия'
              : catalog.length
                ? `На холсте: ${catalog.length} PDF`
                : 'Единый учебный холст'}
          </span>
        </div>
        <div className="lesson-call-controls">
          <button
            disabled
            aria-label="Микрофон — видеосвязь появится позже"
            title="Микрофон появится с видеосвязью"
          >
            <MicOff size={20} />
            <span>Микрофон</span>
          </button>
          <button
            disabled
            aria-label="Камера — видеосвязь появится позже"
            title="Камера появится позже"
          >
            <VideoOff size={20} />
            <span>Камера</span>
          </button>
          <button
            disabled
            aria-label="Демонстрация экрана — позже"
            title="Демонстрация экрана появится позже"
          >
            <MonitorOff size={20} />
            <span>Экран</span>
          </button>
          <i />
          <button
            aria-label="Чат"
            className={sidebar && chatOpen ? 'active' : ''}
            onClick={() => {
              setSidebar(true);
              setChatOpen((v) => (sidebar ? !v : true));
            }}
          >
            <MessageSquare size={20} />
            <span>Чат</span>
          </button>
          <button
            className={sidebar ? 'active' : ''}
            aria-label="Показать участников"
            onClick={() => setSidebar((v) => !v)}
          >
            <Users size={20} />
            <span>{people.length}</span>
          </button>
          {!teacher && !archive && (
            <button
              className={people.find((p) => p.id === user.id)?.handRaised ? 'active' : ''}
              aria-label="Поднять руку"
              onClick={() =>
                socket.current?.emit('classroom-hand', {
                  raised: !people.find((p) => p.id === user.id)?.handRaised,
                })
              }
            >
              <Hand size={20} />
            </button>
          )}
          <button
            className={`lesson-end-button ${mode === 'prepare' ? 'start' : ''}`}
            disabled={busy || !ready}
            onClick={() => void finish()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={20} />
            ) : mode === 'prepare' ? (
              <PlayIcon />
            ) : (
              <PhoneOff size={20} />
            )}
            <span>
              {mode === 'prepare' ? 'Начать урок' : teacher && !archive ? 'Завершить' : 'Выйти'}
            </span>
          </button>
        </div>
        <div className="lesson-footer-save">
          <Check size={17} />
          <span>
            {archive
              ? 'Материалы занятия сохранены'
              : mode === 'prepare'
                ? 'Подготовка к занятию'
                : 'Общая доска урока'}
          </span>
        </div>
      </footer>
      {access && (
        <LessonAccess roomId={id} onClose={() => setAccess(false)} onChange={() => void load()} />
      )}
    </main>
  );
}
function PlayIcon() {
  return <ArrowRight size={20} />;
}
function LessonAccess({
  roomId,
  onClose,
  onChange,
}: {
  roomId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const { room, load, error } = useClassroom(roomId),
    { toast } = useApp();
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [rotate, setRotate] = useState(false);
  if (!room)
    return (
      <Modal title="Доступ к занятию" onClose={onClose}>
        {error ? <FormError error={error} /> : <Busy />}
      </Modal>
    );
  return (
    <div className="lesson-access-drawer">
      <Modal title="Доступ к занятию" onClose={onClose}>
        <p className="muted">{room.title}</p>
        <h3>Участники</h3>
        <div className="lesson-member-row">
          <Avatar name="Преподаватель" />
          <strong>Преподаватель</strong>
          <Badge tone="mint">Владелец</Badge>
        </div>
        {room.students.map((s) => (
          <div className="lesson-member-row" key={s.id}>
            <Avatar name={s.name} color={s.color} />
            <strong>{s.name}</strong>
            <select
              aria-label={`Права: ${s.name}`}
              value={s.permission}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                try {
                  await api(
                    `/classrooms/${roomId}/members/${s.id}`,
                    { permission: e.target.value },
                    'PATCH',
                  );
                  await load();
                  onChange();
                } catch (e) {
                  setFailure((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <option value="edit">Редактирование</option>
              <option value="view">Просмотр</option>
            </select>
          </div>
        ))}
        {room.kind === 'group' ? (
          <section className="lesson-permanent-link">
            <h3>Личные ссылки учеников</h3>
            <PersonalRoomLinks room={room} />
          </section>
        ) : (
          <section className="lesson-permanent-link">
            <h3>Одна ссылка на все занятия</h3>
            <p>
              Ученику не нужны отдельные приглашения к доске. Эта ссылка открывает вход в его
              учебную комнату.
            </p>
            <input aria-label="Постоянная ссылка на занятия" readOnly value={room.link || ''} />
            <Button
              disabled={!room.linkActive}
              onClick={async () => {
                try {
                  const { copyLessonLink } = await import('./shared');
                  await copyLessonLink(room.link!);
                  toast('Ссылка на занятия скопирована');
                } catch (e) {
                  setFailure((e as Error).message);
                }
              }}
            >
              <Copy size={17} />
              Скопировать ссылку
            </Button>
            <Badge tone={room.linkActive ? 'mint' : 'peach'}>
              {room.linkActive ? 'Действует до отзыва' : 'Доступ по ссылке приостановлен'}
            </Badge>
          </section>
        )}
        <FormError error={failure} />
        {room.kind === 'individual' && (
          <div className="lesson-link-management">
            <button onClick={() => setRotate(true)}>Обновить ссылку</button>
            {room.linkActive && (
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/classrooms/${roomId}/link`, { revoke: true });
                    await load();
                    onChange();
                  } catch (e) {
                    setFailure((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Отозвать доступ по ссылке
              </button>
            )}
          </div>
        )}
        {rotate && (
          <div className="lesson-link-rotate">
            <p>Старая ссылка перестанет действовать. Ученику потребуется отправить новую.</p>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/classrooms/${roomId}/link`, { rotate: true });
                  await load();
                  setRotate(false);
                  onChange();
                } catch (e) {
                  setFailure((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Создать новую ссылку
            </Button>
            <button onClick={() => setRotate(false)}>Отмена</button>
          </div>
        )}
        <p className="lesson-access-foot">
          Участники получают доступ только к материалам этой учебной комнаты.
        </p>
      </Modal>
    </div>
  );
}
