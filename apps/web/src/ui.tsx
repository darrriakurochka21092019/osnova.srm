import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Plus, FileText, Upload, LoaderCircle, Check, ArrowRight, Search } from 'lucide-react';
import { fileUrl, upload } from './api';

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  icon: Icon = FileText,
  title = 'Пока здесь пусто',
  text,
  action,
}: {
  icon?: any;
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = ref.current!;
    const focusable = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, a[href], [tabindex="0"]',
        ),
      ].filter((e) => !e.hasAttribute('disabled') && e.offsetParent !== null);
    (focusable()[0] || dialog).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', key);
      old?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
export function Badge({ children, tone = 'purple' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Avatar({
  name,
  color = 'purple',
  small = false,
}: {
  name: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <span className={`avatar ${color} ${small ? 'small' : ''}`}>
      {name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()}
    </span>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Найти…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="searchbox">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Busy() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" />
      <span>Открываем пространство…</span>
    </div>
  );
}
export function FormError({ error }: { error: string }) {
  return error ? (
    <div className="form-error" role="alert">
      {error}
    </div>
  ) : null;
}
export function SaveButton({ busy, label = 'Сохранить' }: { busy: boolean; label?: string }) {
  return (
    <Button type="submit" disabled={busy}>
      {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{' '}
      {busy ? 'Сохраняем…' : label}
    </Button>
  );
}
export function FileUpload({
  ids,
  onChange,
  disabled = false,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="file-upload">
      <label className={`upload-zone ${busy ? 'disabled' : ''}`}>
        <Upload size={21} />
        <strong>{busy ? 'Загружаем…' : 'Прикрепить файлы'}</strong>
        <span>PDF, PNG, JPG, WebP · до 25 МБ</span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          multiple
          disabled={disabled || busy}
          onChange={async (e) => {
            setBusy(true);
            setError('');
            const next = [...ids];
            try {
              for (const f of [...(e.target.files || [])]) {
                const result = await upload(f);
                next.push(result.id);
              }
              onChange(next);
            } catch (err) {
              onChange(next);
              setError((err as Error).message);
            } finally {
              setBusy(false);
              e.target.value = '';
            }
          }}
        />
      </label>
      <FormError error={error} />
      <FileLinks
        ids={ids}
        onRemove={disabled ? undefined : (id) => onChange(ids.filter((x) => x !== id))}
      />
    </div>
  );
}
export function FileLinks({ ids, onRemove }: { ids?: string[]; onRemove?: (id: string) => void }) {
  return (
    <div className="file-links">
      {ids?.map((id, i) => (
        <div key={id} className="file-chip">
          <FileText size={15} />
          <a href={fileUrl(id)} target="_blank" rel="noreferrer">
            Файл {i + 1}
          </a>
          <a href={fileUrl(id, true)} aria-label={`Скачать файл ${i + 1}`} className="muted">
            ↓
          </a>
          {onRemove && (
            <button
              className="icon-btn small"
              type="button"
              onClick={() => onRemove(id)}
              aria-label="Убрать файл"
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
export function Confirm({
  title,
  text,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{text}</p>
      <FormError error={error} />
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Подтвердить
        </Button>
      </div>
    </Modal>
  );
}
