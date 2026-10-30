import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Link2, CircleHelp, ShieldCheck, KeyRound } from 'lucide-react';
import { Brand } from '../Brand';
import { api } from '../api';
import { Busy, Button, Field, FormError, Modal } from '../ui';

type Dialog = 'invite' | 'recover' | 'help' | 'privacy' | null;

export default function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const navigate = useNavigate();
  const [setup, setSetup] = useState<boolean | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', setupToken: '' });
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [invitation, setInvitation] = useState('');
  const [inviteError, setInviteError] = useState('');

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
    <div className="auth-page auth-redesign">
      <aside className="auth-visual" aria-label="Добро пожаловать в EduSpace">
        <Brand light />
        <div className="auth-message">
          <h1>
            Здесь
            <br />
            <span>становится</span>
            <br />
            понятно.
          </h1>
          <p>
            Уроки, материалы и задания —<br />в одном пространстве.
          </p>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="mobile-logo">
            <Brand />
          </div>
          <header className="auth-heading">
            <h1>{setup ? 'Добро пожаловать!' : 'Рады видеть вас'}</h1>
            <p>{setup ? 'Создайте свой кабинет преподавателя' : 'Войдите в свой кабинет'}</p>
          </header>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              setBusy(true);
              try {
                await api(`/auth/${setup ? 'setup' : 'login'}`, { ...form, rememberMe });
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
                  placeholder="Ваше имя"
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
                maxLength={254}
                placeholder="Введите почту"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <div className="auth-password">
              <div className="auth-password-heading">
                <label htmlFor="login-password">Пароль</label>
                {!setup && (
                  <button type="button" onClick={() => setDialog('recover')}>
                    Забыли пароль?
                  </button>
                )}
              </div>
              <div className="auth-password-input">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete={setup ? 'new-password' : 'current-password'}
                  placeholder={setup ? 'Не меньше 10 символов' : 'Введите пароль'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  className="icon-btn"
                  type="button"
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                </button>
              </div>
            </div>
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
            {!setup && (
              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Запомнить на этом устройстве</span>
              </label>
            )}
            <FormError error={error} />
            {setup === null ? (
              <Button type="button" onClick={() => window.location.reload()}>
                Повторить подключение
              </Button>
            ) : (
              <Button type="submit" disabled={busy}>
                {busy ? 'Подождите…' : setup ? 'Создать пространство' : 'Войти'}
              </Button>
            )}
          </form>
          {!setup && (
            <>
              <div className="auth-divider">
                <span>или</span>
              </div>
              <Button
                variant="secondary"
                className="auth-invite"
                onClick={() => {
                  setInviteError('');
                  setDialog('invite');
                }}
              >
                Войти по приглашению
              </Button>
            </>
          )}
          <footer className="auth-links">
            <button onClick={() => setDialog('help')}>Помощь</button>
            <span aria-hidden="true" />
            <button onClick={() => setDialog('privacy')}>Конфиденциальность</button>
          </footer>
        </div>
      </main>
      {dialog && (
        <Modal
          title={
            {
              invite: 'Войти по приглашению',
              recover: 'Восстановление доступа',
              help: 'Помощь со входом',
              privacy: 'Данные и доступ',
            }[dialog]
          }
          onClose={() => setDialog(null)}
          className="auth-info-dialog"
        >
          {dialog === 'invite' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setInviteError('');
                try {
                  const url = new URL(invitation.trim(), window.location.origin);
                  const localHosts = ['localhost', '127.0.0.1'];
                  const sameCabinet =
                    url.origin === window.location.origin ||
                    (localHosts.includes(url.hostname) &&
                      localHosts.includes(window.location.hostname) &&
                      url.port === window.location.port);
                  if (
                    !sameCabinet ||
                    !['http:', 'https:'].includes(url.protocol) ||
                    !/^\/(join|learn\/[a-zA-Z0-9-]+)$/.test(url.pathname) ||
                    !/^#[a-zA-Z0-9_-]{20,100}$/.test(url.hash) ||
                    url.username ||
                    url.password
                  )
                    throw new Error(
                      'Вставьте полную ссылку на занятие или приглашение в этот кабинет.',
                    );
                  navigate(url.pathname + url.hash);
                } catch {
                  setInviteError(
                    'Вставьте полную ссылку на занятие или приглашение в этот кабинет.',
                  );
                }
              }}
            >
              <div className="auth-info-icon">
                <Link2 size={26} />
              </div>
              <p>
                Вставьте ссылку, которую прислал преподаватель. Она откроет ваше занятие или
                настройку личного кабинета.
              </p>
              <Field label="Ссылка-приглашение">
                <input
                  autoFocus
                  required
                  maxLength={2000}
                  value={invitation}
                  onChange={(e) => setInvitation(e.target.value)}
                  placeholder="https://…/learn/…#…"
                />
              </Field>
              <FormError error={inviteError} />
              <div className="form-actions">
                <Button type="submit">Открыть приглашение</Button>
              </div>
            </form>
          ) : dialog === 'recover' ? (
            <>
              <div className="auth-info-icon">
                <KeyRound size={26} />
              </div>
              <h3>Если вы ученик</h3>
              <p>
                Попросите преподавателя отправить новое приглашение в кабинет. По нему можно задать
                почту и новый пароль.
              </p>
              <h3>Если вы преподаватель</h3>
              <p>
                Проверьте сохранённые пароли в браузере. Если восстановить вход не удалось,
                обратитесь к администратору, который разместил ваше пространство.
              </p>
              <p className="muted">
                Вход по постоянной ссылке на занятие остаётся доступен, пока преподаватель не
                отозвал эту ссылку.
              </p>
            </>
          ) : dialog === 'help' ? (
            <>
              <div className="auth-info-icon">
                <CircleHelp size={26} />
              </div>
              <h3>В кабинет — по почте и паролю</h3>
              <p>
                Используйте данные, которые задали при создании кабинета. Проверьте раскладку
                клавиатуры и Caps Lock. Пароль можно посмотреть кнопкой с глазом.
              </p>
              <h3>На занятие — по ссылке преподавателя</h3>
              <p>
                Откройте полученную ссылку или вставьте её через «Войти по приглашению». Если доступ
                отозван, попросите новую ссылку.
              </p>
            </>
          ) : (
            <>
              <div className="auth-info-icon">
                <ShieldCheck size={26} />
              </div>
              <p>
                Данные кабинета и учебные материалы хранятся на сервере вашего пространства
                EduSpace. Преподаватель управляет доступом к занятиям, доскам и заданиям.
              </p>
              <p>
                Ученику доступны его занятия и опубликованные для него материалы. Гостевая ссылка
                предоставляет только назначенный доступ.
              </p>
              <p>
                По вопросам обработки, изменения и удаления данных обратитесь к преподавателю или
                администратору вашего пространства.
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
