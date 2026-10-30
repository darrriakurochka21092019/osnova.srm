import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  Link,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  PanelsTopLeft,
  ClipboardList,
  FolderOpen,
  ChartNoAxesCombined,
  Files,
  Wallet,
  FileText,
  ListTodo,
  Bell,
  CircleHelp,
  Settings,
  LogOut,
  Menu,
  X,
  ArrowRight,
  Sparkles,
  Search,
  ChevronRight,
} from 'lucide-react';
import { io } from 'socket.io-client';
import '@fontsource-variable/manrope';
import './styles.css';
import './lesson/lesson.css';
import { Brand, AccessExpired } from './lesson/shared';
import { api, date } from './api';
import { AppStore, useApp } from './store';
import { Avatar, Badge, Busy, Button, Field, FormError, Modal, SaveButton } from './ui';
import type { User } from '../../../packages/contracts';
import {
  Dashboard,
  BoardsPage,
  StudentsPage,
  StudentDetail,
  SchedulePage,
} from './pages/workspace';
import {
  HomeworkPage,
  HomeworkDetail,
  MaterialsPage,
  ProgressPage,
  ReportsPage,
  FinancesPage,
  DocumentsPage,
  TasksPage,
  NotificationsPage,
  SettingsPage,
  HelpPage,
} from './pages/learning';

(window as any).EXCALIDRAW_ASSET_PATH = `${window.location.origin}/excalidraw-assets/`;
const BoardRoom = lazy(() => import('./pages/BoardRoom'));
const LessonRouter = lazy(() => import('./lesson/LessonRoom'));
const PublicLessonEntry = lazy(() => import('./lesson/LessonEntry'));
const ClassroomsPage = lazy(() => import('./lesson/ClassroomsPage'));
const LessonSummary = lazy(() => import('./lesson/LessonSummary'));
export function Logo() {
  return <Brand />;
}
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <Logo />
        <h1>Не получилось открыть страницу</h1>
        <p>Сохранённые на сервере данные доступны после перезагрузки.</p>
        <Button onClick={() => window.location.reload()}>Перезагрузить</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [setup, setSetup] = useState<boolean | null>(null),
    [needsKey, setNeedsKey] = useState(false),
    [form, setForm] = useState({ name: '', email: '', password: '', setupToken: '' }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/bootstrap')
      .then((b) => {
        setSetup(b.setupNeeded);
        setNeedsKey(b.tokenRequired);
      })
      .catch((e) => setError(e.message));
  }, []);
  if (setup === null && !error) return <Busy />;
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <Logo />
        <div>
          <span className="eyebrow">МЕНЬШЕ РУТИНЫ. БОЛЬШЕ ЗНАНИЙ.</span>
          <h1>
            Всё начинается
            <br />с основы<span>.</span>
          </h1>
          <p>
            Уроки, которые объединяют.
            <br />
            Пространство, в котором удобно учить.
          </p>
          <div className="art-board">
            <span className="art-tag">Каждый урок — в одном месте</span>
            <p>
              Учиться — значит
              <br />
              <em>открывать новое.</em>
            </p>
            <div className="art-underline" />
            <span className="art-cursor">↖ Вместе на одной доске</span>
            <div className="art-dot" />
          </div>
        </div>
        <small>Ваше пространство для обучения</small>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="mobile-logo">
            <Logo />
          </div>
          <Badge>Добро пожаловать</Badge>
          <h1>{setup ? 'Создадим ваше пространство' : 'С возвращением'}</h1>
          <p className="muted">
            {setup
              ? 'Настройка выполняется один раз. Вы станете преподавателем и владельцем пространства.'
              : 'Войдите, чтобы продолжить уроки и открыть материалы.'}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await api(`/auth/${setup ? 'setup' : 'login'}`, form);
                await onLogin();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {setup && (
              <Field label="Как к вам обращаться">
                <input
                  required
                  autoComplete="name"
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
            )}
            <Field label="Электронная почта">
              <input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field
              label="Пароль"
              hint={setup ? 'Не меньше 10 символов. Сохраните пароль в надёжном месте.' : undefined}
            >
              <input
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete={setup ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            {setup && needsKey && (
              <Field label="Ключ первоначальной настройки">
                <input
                  type="password"
                  required
                  value={form.setupToken}
                  onChange={(e) => setForm({ ...form, setupToken: e.target.value })}
                />
              </Field>
            )}
            <FormError error={error} />
            <SaveButton busy={busy} label={setup ? 'Создать пространство' : 'Войти в EduSpace'} />
          </form>
          {!setup && (
            <p className="auth-foot muted">
              Нет доступа к кабинету? Попросите преподавателя прислать приглашение.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
function Join({ onLogin }: { onLogin: () => Promise<void> }) {
  const navigate = useNavigate();
  const [inviteToken] = useState(() => {
    const t = location.hash.slice(1);
    history.replaceState(null, '', location.pathname);
    return t;
  });
  const [info, setInfo] = useState<any>(null),
    [invalid, setInvalid] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState({ name: '', email: '', password: '' });
  useEffect(() => {
    api('/invites/info', { token: inviteToken })
      .then(setInfo)
      .catch((e) => {
        setError(e.message);
        setInvalid([404, 410].includes(e.status));
      });
  }, []);
  if (invalid) return <AccessExpired message={error} />;
  return (
    <div className="join-page">
      <div className="auth-card">
        <Logo />
        <Badge>По приглашению</Badge>
        <h1>{info?.account ? 'Ваш учебный кабинет' : 'Присоединиться к уроку'}</h1>
        <p className="muted">
          {info?.account
            ? 'Задайте имя, почту и пароль. По ним вы сможете входить в кабинет в следующий раз.'
            : 'Введите имя, которое увидят участники доски.'}
        </p>
        {info && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const result = await api('/invites/redeem', {
                  token: inviteToken,
                  name: form.name,
                  ...(info.account ? { email: form.email, password: form.password } : {}),
                });
                await onLogin();
                navigate(result.boardId ? `/board/${result.boardId}` : '/');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Ваше имя">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            {info.account && (
              <>
                <Field label="Электронная почта">
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Пароль — от 10 символов">
                  <input
                    type="password"
                    required
                    minLength={10}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </Field>
              </>
            )}
            <SaveButton
              busy={busy}
              label={info.account ? 'Создать вход в кабинет' : 'Открыть доску'}
            />
          </form>
        )}
        <FormError error={error} />
        <Link className="text-link" to="/">
          На главную <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
const navigation = [
  ['/', 'Сегодня', LayoutDashboard],
  ['/schedule', 'Расписание', CalendarDays],
  ['/students', 'Ученики', Users],
  ['/lessons', 'Уроки', PanelsTopLeft],
  ['/homework', 'Задания', ClipboardList],
  ['/materials', 'Материалы', FolderOpen],
  ['/progress', 'Прогресс', ChartNoAxesCombined],
  ['/reports', 'Отчёты', Files],
  ['/finances', 'Финансы', Wallet],
  ['/documents', 'Документы', FileText],
  ['/tasks', 'Задачи и заметки', ListTodo],
  ['/notifications', 'Уведомления', Bell],
] as const;
const studentPaths = [
  '/',
  '/schedule',
  '/boards',
  '/lessons',
  '/homework',
  '/materials',
  '/progress',
  '/notifications',
];
function Shell({ onLogout }: { onLogout: () => void }) {
  const { user, records, refresh, toast } = useApp(),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [mobile, setMobile] = useState(false),
    [tour, setTour] = useState(false),
    [query, setQuery] = useState('');
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    refresh()
      .then(() => {
        setReady(true);
        if (!user.settings.onboardingComplete && user.role !== 'guest') setTour(true);
      })
      .catch((e) => setError(e.message));
    const focus = () => refresh().catch(() => {});
    window.addEventListener('focus', focus);
    const interval = setInterval(focus, 30000);
    const socket = io({ withCredentials: true });
    socket.on('notification', () => {
      refresh().catch(() => {});
      toast('Новое уведомление');
    });
    return () => {
      window.removeEventListener('focus', focus);
      clearInterval(interval);
      socket.disconnect();
    };
  }, [user.id]);
  useEffect(() => {
    setMobile(false);
    setQuery('');
  }, [location.pathname]);
  const unread = records.notification.filter((n) => !n.data.read).length;
  const nav = navigation.filter(
    ([p]) =>
      user.role === 'teacher' ||
      (user.role === 'student' && studentPaths.includes(p)) ||
      (user.role === 'guest' && p === '/lessons'),
  );
  const title = location.pathname.includes('/summary/')
    ? 'Итоги урока'
    : navigation.find(([p]) =>
        p === '/' ? location.pathname === '/' : location.pathname.startsWith(p),
      )?.[1] || 'Моё пространство';
  const matches = query.trim()
    ? nav.filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()))
    : [];
  if (!ready)
    return error ? (
      <div className="fatal">
        <FormError error={error} />
        <Button onClick={() => window.location.reload()}>Повторить</Button>
      </div>
    ) : (
      <Busy />
    );
  if (location.pathname.startsWith('/board/'))
    return (
      <Routes>
        <Route
          path="/board/:id"
          element={
            <Suspense fallback={<Busy />}>
              <BoardRoom />
            </Suspense>
          }
        />
      </Routes>
    );
  return (
    <div className="app-layout">
      {mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)} />}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <Link to="/" className="brand-link">
          <Logo />
        </Link>
        <span className="workspace-label">
          {user.role === 'teacher'
            ? 'Кабинет преподавателя'
            : user.role === 'student'
              ? 'Моё обучение'
              : 'Гостевой доступ'}
        </span>
        <nav>
          {nav.map(([p, name, Icon], i) => (
            <React.Fragment key={p}>
              {i === 8 && <div className="nav-divider" />}
              <NavLink
                to={p}
                end={p === '/'}
                className={({ isActive }) =>
                  isActive || (p === '/lessons' && location.pathname.startsWith('/lesson/'))
                    ? 'active'
                    : ''
                }
              >
                <Icon size={19} />
                <span>{name}</span>
                {p === '/notifications' && unread > 0 && (
                  <span className="nav-count">{unread}</span>
                )}
              </NavLink>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/help">
            <CircleHelp size={19} />
            Помощь
          </NavLink>
          {user.role !== 'guest' && (
            <NavLink to="/settings">
              <Settings size={19} />
              Настройки
            </NavLink>
          )}
          <div className="profile">
            <Avatar name={user.name} small />
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.role === 'teacher'
                  ? 'Преподаватель'
                  : user.role === 'student'
                    ? 'Ученик'
                    : 'Гость'}
              </small>
            </div>
            <button
              className="icon-btn"
              aria-label="Выйти"
              onClick={async () => {
                try {
                  await api('/auth/logout', {});
                  onLogout();
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Открыть меню"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            Моё пространство <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={17} />
              <input
                aria-label="Найти раздел"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Найти раздел…"
              />
              {query && (
                <div className="search-results">
                  {matches.length ? (
                    matches.map(([p, name]) => (
                      <Link to={p} key={p}>
                        {name}
                        <ArrowRight size={14} />
                      </Link>
                    ))
                  ) : (
                    <span>Раздел не найден</span>
                  )}
                </div>
              )}
            </div>
            <button
              className="icon-btn help-button"
              title="Знакомство с платформой"
              aria-label="Запустить обучение"
              onClick={() => setTour(true)}
            >
              <CircleHelp size={20} />
            </button>
            <Link
              className="icon-btn notification-button"
              to="/notifications"
              aria-label={`Уведомления: ${unread} новых`}
            >
              <Bell size={21} />
              {unread > 0 && <i />}
            </Link>
            <Avatar name={user.name} small />
          </div>
        </header>
        <main className="content" id="main-content">
          <Routes>
            <Route
              path="/"
              element={user.role === 'guest' ? <Navigate to="/lessons" /> : <Dashboard />}
            />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/boards" element={<BoardsPage />} />
            <Route
              path="/lessons"
              element={
                <Suspense fallback={<Busy />}>
                  <ClassroomsPage />
                </Suspense>
              }
            />
            <Route
              path="/lesson/:id/summary/:sessionId"
              element={
                <Suspense fallback={<Busy />}>
                  <LessonSummary />
                </Suspense>
              }
            />
            <Route path="/homework" element={<HomeworkPage />} />
            <Route path="/homework/:id" element={<HomeworkDetail />} />
            <Route path="/materials" element={<MaterialsPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/help" element={<HelpPage onTour={() => setTour(true)} />} />
            {user.role === 'teacher' && (
              <>
                <Route path="/students" element={<StudentsPage />} />
                <Route path="/students/:id" element={<StudentDetail />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/finances" element={<FinancesPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/tasks" element={<TasksPage />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <Brand /> <span>Всё для хорошего урока</span>
          <span>{date(new Date(), { year: 'numeric' })} · МСК</span>
        </footer>
      </div>
      <nav className="bottom-nav">
        {nav
          .filter(([p]) => ['/', '/schedule', '/lessons', '/homework'].includes(p))
          .map(([p, n, I]) => (
            <NavLink end={p === '/'} key={p} to={p}>
              <I size={21} />
              <span>{n}</span>
            </NavLink>
          ))}
        <button onClick={() => setMobile(true)}>
          <Menu size={21} />
          <span>Ещё</span>
        </button>
      </nav>
      {tour && <Tour onClose={() => setTour(false)} />}
    </div>
  );
}
function Tour({ onClose }: { onClose: () => void }) {
  const { user, setUser, toast } = useApp();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const steps =
    user.role === 'teacher'
      ? [
          [
            'Ваш день — в одном месте',
            'На главной собраны ближайшие занятия, задания на проверку и важные дела. Откройте любой раздел слева.',
            '/',
          ],
          [
            'Сначала добавьте ученика',
            'В карточке хранятся цель и программа обучения. Кнопка приглашения создаёт личный вход ученика.',
            '/students',
          ],
          [
            'Планируйте занятия',
            'Добавьте урок и выберите ученика или мини-группу. Постоянная комната и общая доска привяжутся автоматически.',
            '/schedule',
          ],
          [
            'Общая доска для урока',
            'У каждого ученика автоматически появляется учебная комната. Подготовьте материалы и отправьте одну постоянную ссылку на все занятия.',
            '/lessons',
          ],
          [
            'Продолжайте после урока',
            'Назначайте и проверяйте задания, фиксируйте результаты. Отчёты и финансы используют данные занятий.',
            '/homework',
          ],
        ]
      : [
          [
            'Добро пожаловать в кабинет',
            'На главной — ближайший урок, актуальные задания и материалы.',
            '/',
          ],
          [
            'Ваши уроки',
            'Откройте занятие в расписании и войдите на урок. Вы попадёте на общую доску, когда преподаватель начнёт занятие.',
            '/schedule',
          ],
          [
            'Домашняя работа',
            'Откройте задание, напишите ответ или прикрепите фотографии. Можно сохранить черновик.',
            '/homework',
          ],
          [
            'Ваш прогресс',
            'После проверки в задании появится комментарий, а в прогрессе — результаты работ.',
            '/progress',
          ],
        ];
  const finish = async () => {
    try {
      setUser(await api('/me', { settings: { onboardingComplete: true } }, 'PATCH'));
    } catch (e) {
      toast((e as Error).message);
    }
    onClose();
  };
  return (
    <Modal title="Давайте освоимся" onClose={finish}>
      <div className="tour-illustration">
        <Sparkles size={46} />
        <span>
          {step + 1} / {steps.length}
        </span>
      </div>
      <h2>{steps[step][0]}</h2>
      <p className="muted">{steps[step][1]}</p>
      <div className="tour-dots">
        {steps.map((_, i) => (
          <i key={i} className={i === step ? 'active' : ''} />
        ))}
      </div>
      <div className="form-actions">
        <Button variant="ghost" onClick={finish}>
          Пропустить обучение
        </Button>
        <Button
          onClick={() => {
            if (step === steps.length - 1) {
              void finish();
              return;
            }
            navigate(steps[step + 1][2]);
            setStep(step + 1);
          }}
        >
          {step === steps.length - 1 ? 'Готово' : 'Далее'}
          <ArrowRight size={16} />
        </Button>
      </div>
    </Modal>
  );
}
function App() {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const loadUser = async () => {
    const user = await api<User>('/me');
    setUser(user);
  };
  useEffect(() => {
    loadUser()
      .catch(() => {})
      .finally(() => setLoading(false));
    const expire = () => setUser(null);
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  if (loading) return <Busy />;
  if (location.pathname.startsWith('/learn/'))
    return (
      <Routes>
        <Route
          path="/learn/:id"
          element={
            <Suspense fallback={<Busy />}>
              <PublicLessonEntry user={user} onLogin={loadUser} />
            </Suspense>
          }
        />
      </Routes>
    );
  if (location.pathname === '/join') return <Join onLogin={loadUser} />;
  if (!user) return <Login onLogin={loadUser} />;
  return (
    <AppStore user={user} setUser={setUser}>
      {location.pathname.startsWith('/lesson/') && !location.pathname.includes('/summary/') ? (
        <Suspense fallback={<Busy />}>
          <LessonRouter />
        </Suspense>
      ) : (
        <Shell onLogout={() => setUser(null)} />
      )}
    </AppStore>
  );
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);
