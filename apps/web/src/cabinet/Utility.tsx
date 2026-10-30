import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderOpen,
  GraduationCap,
  LockKeyhole,
  Mail,
  Monitor,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  VideoOff,
} from 'lucide-react';
import { api, date, localInput, todayKey } from '../api';
import { useApp } from '../store';
import {
  Avatar,
  Badge,
  Button,
  Empty,
  Field,
  FormError,
  Modal,
  PageHead,
  SaveButton,
  SearchBox,
} from '../ui';
import { Brand } from '../Brand';
import { Privacy } from './shared';

const category = (path: string) =>
  /^\/(lesson|board|schedule)/.test(path)
    ? 'lessons'
    : path.startsWith('/homework')
      ? 'homework'
      : 'organization';
export function NotificationsPage() {
  const { records, update, refresh, toast } = useApp(),
    [filter, setFilter] = useState('all'),
    [busy, setBusy] = useState(false);
  const unread = records.notification.filter((n) => !n.data.read).length;
  const list = records.notification
    .filter(
      (n) =>
        filter === 'all' || (filter === 'unread' ? !n.data.read : category(n.data.path) === filter),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const groups = [...new Set(list.map((n) => localInput(n.created_at).slice(0, 10)))];
  return (
    <>
      <PageHead
        title="Уведомления"
        action={
          <div className="button-row">
            <Button
              variant="secondary"
              disabled={busy || !unread}
              onClick={async () => {
                setBusy(true);
                try {
                  for (const n of records.notification.filter((n) => !n.data.read))
                    await api(`/records/notification/${n.id}`, { data: { read: true } }, 'PATCH');
                  await refresh();
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Mail size={18} />
              Прочитать все
            </Button>
            <Link className="btn btn-secondary" to="/settings?tab=notifications">
              <Settings size={18} />
              Настроить
            </Link>
          </div>
        }
      />
      <div className="tabs page-tabs">
        {[
          ['all', 'Все'],
          ['unread', 'Непрочитанные'],
          ['lessons', 'Уроки'],
          ['homework', 'Задания'],
          ['organization', 'Организация'],
        ].map(([v, n]) => (
          <button className={filter === v ? 'active' : ''} key={v} onClick={() => setFilter(v)}>
            {n}
            {v === 'unread' && <Badge>{unread}</Badge>}
          </button>
        ))}
      </div>
      <div className="cabinet-grid">
        <section className="panel notification-feed">
          {groups.map((day) => (
            <section key={day}>
              <div className="section-heading">
                <h2>
                  {day === todayKey()
                    ? 'Сегодня'
                    : date(`${day}T12:00:00+03:00`, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                </h2>
                <small className="muted">МСК</small>
              </div>
              {list
                .filter((n) => localInput(n.created_at).startsWith(day))
                .map((n) => {
                  const cat = category(n.data.path),
                    Icon = cat === 'lessons' ? GraduationCap : cat === 'homework' ? FileText : Bell;
                  return (
                    <div className={`notification-item ${n.data.read ? '' : 'unread'}`} key={n.id}>
                      <span
                        className={`round-icon ${cat === 'homework' ? 'peach' : cat === 'lessons' ? 'blue' : 'purple'}`}
                      >
                        <Icon size={23} />
                      </span>
                      <div>
                        <strong>{n.data.title}</strong>
                        <p>{n.data.message}</p>
                        <small className="muted">
                          {date(n.created_at, {
                            day: undefined,
                            month: undefined,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          МСК
                        </small>
                        <Link
                          className="text-link"
                          to={n.data.path}
                          onClick={() => {
                            if (!n.data.read)
                              update(n, { read: true }).catch((e) => toast(e.message));
                          }}
                        >
                          Открыть <ArrowRight size={15} />
                        </Link>
                      </div>
                      {!n.data.read && (
                        <button
                          className="icon-btn"
                          aria-label="Отметить прочитанным"
                          onClick={() => update(n, { read: true }).catch((e) => toast(e.message))}
                        >
                          <Check size={18} />
                        </button>
                      )}
                    </div>
                  );
                })}
            </section>
          ))}
          {!list.length && (
            <Empty
              icon={Bell}
              title="Вы ничего не пропустили"
              text="Новые события появятся здесь автоматически."
            />
          )}
        </section>
        <aside className="panel">
          <h2>Что вы получаете</h2>
          <p className="muted">Все важные события учебного процесса — в одном месте.</p>
          {[
            [
              GraduationCap,
              'Уроки',
              'Начало занятий, изменения в расписании и запросы на перенос.',
              'blue',
            ],
            [
              FileText,
              'Домашние задания',
              'Новые работы, сроки сдачи и комментарии преподавателя.',
              'peach',
            ],
            [Bell, 'Рабочие напоминания', 'Отчёты, задачи и информация об оплатах.', 'purple'],
          ].map(([Icon, title, text, tone], i) => {
            const I = Icon as typeof Bell;
            return (
              <div className="cabinet-mini-row" key={i}>
                <span className={`round-icon ${tone}`}>
                  <I size={23} />
                </span>
                <div>
                  <h3>{String(title)}</h3>
                  <p className="muted small-text">{String(text)}</p>
                </div>
              </div>
            );
          })}
          <Link
            className="btn btn-secondary"
            style={{ marginTop: 18, width: '100%' }}
            to="/settings?tab=notifications"
          >
            Изменить настройки <ArrowRight size={16} />
          </Link>
        </aside>
      </div>
    </>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="cabinet-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span aria-hidden="true" />
    </label>
  );
}
export function SettingsPage() {
  const { user, setUser, toast } = useApp(),
    [search, setSearch] = useSearchParams(),
    tab = search.get('tab') || 'notifications';
  const defaults = { enabled: true, lessons: true, homework: true, organization: true };
  const [form, setForm] = useState({
      name: user.name,
      reminders: user.settings.reminders !== false,
      reminderMinutes: Number(user.settings.reminderMinutes || 30),
      quietStart: String(user.settings.quietStart || '22:00'),
      quietEnd: String(user.settings.quietEnd || '08:00'),
      notifications: {
        ...defaults,
        ...((user.settings.notifications as Partial<typeof defaults>) || {}),
      },
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [password, setPassword] = useState({ currentPassword: '', newPassword: '' }),
    [passwordOpen, setPasswordOpen] = useState(false),
    [sessions, setSessions] = useState<any[]>([]),
    [notice, setNotice] = useState('');
  useEffect(() => {
    api('/auth/sessions')
      .then(setSessions)
      .catch((e) => setError(e.message));
  }, []);
  const setNotification = (key: keyof typeof defaults, value: boolean) =>
    setForm({ ...form, notifications: { ...form.notifications, [key]: value } });
  const reset = () =>
    setForm({
      name: user.name,
      reminders: user.settings.reminders !== false,
      reminderMinutes: Number(user.settings.reminderMinutes || 30),
      quietStart: String(user.settings.quietStart || '22:00'),
      quietEnd: String(user.settings.quietEnd || '08:00'),
      notifications: {
        ...defaults,
        ...((user.settings.notifications as Partial<typeof defaults>) || {}),
      },
    });
  return (
    <>
      <PageHead title="Настройки" />
      <div className="tabs page-tabs cabinet-settings-tabs">
        {[
          ['profile', 'Профиль'],
          ['notifications', 'Уведомления'],
          ['lessons', 'Уроки'],
          ['security', 'Безопасность'],
        ].map(([v, n]) => (
          <button
            className={tab === v ? 'active' : ''}
            key={v}
            onClick={() => setSearch({ tab: v })}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="cabinet-grid">
        <section className="panel">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const { name, ...settings } = form;
                setUser(await api('/me', { name, settings }, 'PATCH'));
                toast('Настройки сохранены');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tab === 'profile' && (
              <>
                <h2>Ваш профиль</h2>
                <p className="muted">Так вас видят участники занятий.</p>
                <Field label="Имя на уроке">
                  <input
                    required
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Почта для входа">
                  <input value={user.email || 'Гостевой вход'} disabled />
                </Field>
              </>
            )}
            {tab === 'notifications' && (
              <>
                <h2>Уведомления и напоминания</h2>
                <p className="muted">Выберите события и удобное время</p>
                <div className="cabinet-setting-row cabinet-note">
                  <strong>Автоматические уведомления</strong>
                  <Switch
                    label="Уведомления внутри платформы"
                    checked={form.notifications.enabled}
                    onChange={(v) => setNotification('enabled', v)}
                  />
                </div>
                {[
                  ['lessons', 'Занятия', 'Начало, переносы и изменения в расписании'],
                  ['homework', 'Домашние задания', 'Сданные работы, сроки и комментарии'],
                  ['organization', 'Организация', 'Задачи, отчёты и информация об оплатах'],
                ].map(([v, n, h]) => (
                  <div className="cabinet-setting-row" key={v}>
                    <div>
                      <strong>{n}</strong>
                      <small>{h}</small>
                    </div>
                    <Switch
                      label={`Уведомления: ${n}`}
                      checked={form.notifications[v as keyof typeof defaults]}
                      onChange={(value) => setNotification(v as keyof typeof defaults, value)}
                    />
                  </div>
                ))}
                <div className="cabinet-setting-row">
                  <div>
                    <strong>Предстоящий урок</strong>
                    <small>Напоминание о начале занятия</small>
                  </div>
                  <Switch
                    label="Напоминать о ближайших уроках"
                    checked={form.reminders}
                    onChange={(v) => setForm({ ...form, reminders: v })}
                  />
                </div>
                <Field label="За сколько минут">
                  <select
                    value={form.reminderMinutes}
                    onChange={(e) => setForm({ ...form, reminderMinutes: Number(e.target.value) })}
                  >
                    {[5, 15, 30, 60, 120].map((v) => (
                      <option key={v} value={v}>
                        За {v} минут
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="cabinet-note">
                  <h3>Тихие часы · МСК</h3>
                  <div className="form-grid">
                    <Field label="С">
                      <input
                        type="time"
                        required
                        value={form.quietStart}
                        onChange={(e) => setForm({ ...form, quietStart: e.target.value })}
                      />
                    </Field>
                    <Field label="До">
                      <input
                        type="time"
                        required
                        value={form.quietEnd}
                        onChange={(e) => setForm({ ...form, quietEnd: e.target.value })}
                      />
                    </Field>
                  </div>
                  <p className="muted small-text">
                    В эти часы напоминания о начале урока не создаются. Одинаковое время отключает
                    тихие часы.
                  </p>
                </div>
                <h3 style={{ marginTop: 22 }}>Дополнительные каналы</h3>
                <div className="cabinet-columns">
                  {['Email', 'Telegram'].map((channel) => (
                    <div className="cabinet-note" key={channel}>
                      <strong>{channel}</strong> <Badge tone="gray">Не подключён</Badge>
                      <p className="muted small-text">Уведомления доступны внутри платформы.</p>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => setNotice(channel)}
                      >
                        Подробнее <ArrowRight size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === 'lessons' && (
              <>
                <h2>Настройки уроков</h2>
                <div className="cabinet-note">
                  <h3>Московское время</h3>
                  <p>Расписание и сроки заданий показываются по МСК для всех участников.</p>
                </div>
                <div className="cabinet-setting-row">
                  <div>
                    <strong>Напоминать о ближайших уроках</strong>
                    <small>В центре уведомлений на сайте</small>
                  </div>
                  <Switch
                    label="Напоминать о ближайших уроках"
                    checked={form.reminders}
                    onChange={(v) => setForm({ ...form, reminders: v })}
                  />
                </div>
                <Field label="За сколько минут">
                  <select
                    value={form.reminderMinutes}
                    onChange={(e) => setForm({ ...form, reminderMinutes: Number(e.target.value) })}
                  >
                    {[5, 15, 30, 60, 120].map((v) => (
                      <option value={v} key={v}>
                        {v} минут
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="muted">Настройки инструментов и фона доступны на самой доске.</p>
              </>
            )}
            {tab === 'security' && (
              <>
                <h2>Безопасность кабинета</h2>
                <p className="muted">
                  Управляйте паролем и проверяйте список активных сеансов справа.
                </p>
                <Button type="button" variant="secondary" onClick={() => setPasswordOpen(true)}>
                  <LockKeyhole size={17} />
                  Изменить пароль
                </Button>
                <Privacy>Пароль не отображается и не хранится в браузере приложением.</Privacy>
              </>
            )}
            <FormError error={error} />
            {tab !== 'security' && (
              <div className="form-actions">
                <SaveButton busy={busy} label="Сохранить изменения" />
                <Button type="button" variant="secondary" onClick={reset}>
                  Отмена
                </Button>
              </div>
            )}
          </form>
        </section>
        <aside className="panel">
          <h2>Безопасность</h2>
          <div className="cabinet-setting-row">
            <span className="round-icon purple">
              <LockKeyhole size={23} />
            </span>
            <div>
              <strong>Пароль</strong>
              <p className="muted">••••••••••</p>
            </div>
            <Button variant="secondary" onClick={() => setPasswordOpen(true)}>
              Изменить пароль
            </Button>
          </div>
          <h2 style={{ marginTop: 24 }}>Активные сеансы</h2>
          {sessions.map((s, i) => (
            <div className="cabinet-setting-row" key={i}>
              <span className="round-icon purple">
                <Monitor size={22} />
              </span>
              <div>
                <strong>{s.current ? 'Этот сеанс' : 'Другой сеанс'}</strong>
                <small>
                  Вход: {date(s.created_at, { hour: '2-digit', minute: '2-digit' })} МСК
                </small>
              </div>
              <Badge tone={s.current ? 'mint' : 'gray'}>{s.current ? 'Активен' : 'Открыт'}</Badge>
            </div>
          ))}
          <Button
            variant="secondary"
            disabled={!sessions.some((s) => !s.current)}
            onClick={async () => {
              try {
                await api('/auth/revoke-other-sessions', {});
                setSessions(await api('/auth/sessions'));
                toast('Другие сеансы завершены');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Завершить другие сеансы
          </Button>
          <hr />
          <h2>Профиль</h2>
          <div className="cabinet-setting-row">
            <Avatar name={user.name} />
            <div>
              <strong>{user.name}</strong>
              <small>{user.role === 'teacher' ? 'Преподаватель' : 'Ученик'}</small>
            </div>
          </div>
          <Privacy>Роль и права определяются вашим доступом к кабинету.</Privacy>
        </aside>
      </div>
      {passwordOpen && (
        <Modal
          title="Изменить пароль"
          onClose={() => {
            setPasswordOpen(false);
            setPassword({ currentPassword: '', newPassword: '' });
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await api('/auth/password', password);
                setPassword({ currentPassword: '', newPassword: '' });
                setPasswordOpen(false);
                setSessions(await api('/auth/sessions'));
                toast('Пароль изменён. Остальные сеансы завершены.');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Текущий пароль">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password.currentPassword}
                onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })}
              />
            </Field>
            <Field label="Новый пароль — от 10 символов">
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={password.newPassword}
                onChange={(e) => setPassword({ ...password, newPassword: e.target.value })}
              />
            </Field>
            <FormError error={error} />
            <SaveButton busy={busy} label="Изменить пароль" />
          </form>
        </Modal>
      )}
      {notice && (
        <Modal title={`${notice}: уведомления`} onClose={() => setNotice('')}>
          <p>
            Этот канал пока не подключён. Все события доступны в разделе «Уведомления» внутри
            EduSpace.
          </p>
          <p className="muted">
            Для внешней доставки потребуется отдельная настройка почты или бота на сервере.
          </p>
          <Button onClick={() => setNotice('')}>Понятно</Button>
        </Modal>
      )}
    </>
  );
}

export function HelpLayout({ faq, onTour }: { faq: string[][]; onTour: () => void }) {
  const [query, setQuery] = useState('');
  const found = faq.filter(([q, a]) => `${q} ${a}`.toLowerCase().includes(query.toLowerCase()));
  const cards = [
    {
      Icon: Monitor,
      title: 'Доска и PDF',
      text: 'Материалы, инструменты и сохранение общего холста.',
      tone: 'blue',
      links: [
        ['Учебные комнаты', '/lessons'],
        ['Загрузить материал', '/materials'],
      ],
    },
    {
      Icon: VideoOff,
      title: 'Связь во время урока',
      text: 'Видеосвязь пока не подключена. Доска работает самостоятельно.',
      tone: 'mint',
      links: [['Открыть уроки', '/lessons']],
    },
    {
      Icon: FileText,
      title: 'Задания и проверка',
      text: 'Создавайте задания, получайте ответы и оставляйте комментарии.',
      tone: 'peach',
      links: [
        ['Домашние задания', '/homework'],
        ['Прогресс ученика', '/progress'],
      ],
    },
    {
      Icon: Users,
      title: 'Ученики и расписание',
      text: 'Планируйте занятия и храните всё в карточке ученика.',
      tone: 'purple',
      links: [
        ['Ученики', '/students'],
        ['Расписание занятий', '/schedule'],
      ],
    },
  ];
  const { user } = useApp();
  return (
    <>
      <PageHead title="Помощь" description="Быстро найдите ответ и продолжайте урок" />
      <SearchBox value={query} onChange={setQuery} placeholder="Например: как загрузить PDF" />
      {!query && (
        <>
          <section className="cabinet-help-hero">
            <div>
              <h2>Освоимся в EduSpace за несколько минут</h2>
              <p>Доска, ученики, задания и расписание — всё, чтобы начать уверенно.</p>
              <Button onClick={onTour}>
                <Sparkles size={18} />
                Пройти знакомство
              </Button>
            </div>
            <Brand mark />
          </section>
          <div className="cabinet-grid">
            <div className="cabinet-help-cards">
              {cards
                .filter((c) => user.role === 'teacher' || c.title !== 'Ученики и расписание')
                .map(({ Icon, title, text, tone, links }) => (
                  <section className="panel" key={title}>
                    <span className={`round-icon ${tone}`}>
                      <Icon size={25} />
                    </span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                    {links.map(([n, p]) => (
                      <Link key={p} to={p}>
                        {n} <ArrowRight size={14} />
                      </Link>
                    ))}
                  </section>
                ))}
            </div>
            <section className="panel">
              <h2>Как начать первый урок</h2>
              <div className="cabinet-timeline">
                {(user.role === 'teacher'
                  ? [
                      [
                        'Добавьте ученика',
                        'Его постоянная учебная комната появится автоматически.',
                      ],
                      ['Подготовьте материалы', 'Загрузите PDF или используйте чистую доску.'],
                      ['Пригласите ученика', 'Отправьте одну ссылку на все ваши занятия.'],
                      ['Войдите на урок', 'Начните занятие и работайте на общем холсте.'],
                    ]
                  : [
                      ['Откройте ссылку преподавателя', 'Укажите имя и дождитесь начала урока.'],
                      ['Войдите на доску', 'Все материалы занятия находятся на общем холсте.'],
                      ['Выполните домашнее задание', 'Прикрепите ответ в личном кабинете.'],
                    ]
                ).map(([title, text], i) => (
                  <div key={title}>
                    <Badge>{i + 1}</Badge>
                    <div>
                      <strong>{title}</strong>
                      <p>{text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="secondary" onClick={onTour}>
                <BookOpen size={16} />
                Открыть инструкцию
              </Button>
            </section>
          </div>
        </>
      )}
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Частые вопросы</h2>
        {found.map(([q, a]) => (
          <details className="faq" key={q}>
            <summary>
              {q}
              <Plus size={17} />
            </summary>
            <p>{a}</p>
          </details>
        ))}
        {!found.length && (
          <Empty
            title="Ответ не найден"
            text="Попробуйте другое слово: доска, задание, ссылка или PDF."
          />
        )}
      </section>
    </>
  );
}
