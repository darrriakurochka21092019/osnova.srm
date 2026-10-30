import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, FileText, LockKeyhole, Download, ExternalLink } from 'lucide-react';
import type { Asset, Entry } from '../../../../packages/contracts';
import { api, fileUrl } from '../api';
import { useApp } from '../store';
import { Badge, Confirm, Empty, FormError } from '../ui';
const PdfPreview = lazy(() => import('./PdfPreview'));
export function quantity(count: number, forms: [string, string, string]) {
  const last = Math.abs(count) % 10,
    tens = Math.abs(count) % 100;
  return `${count} ${forms[tens >= 11 && tens <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2]}`;
}

export function Menu({ children, label = 'Действия' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null),
    popover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const rect = trigger.current!.getBoundingClientRect(),
      height = Math.min(popover.current!.scrollHeight, innerHeight - 16);
    setPosition((p) => ({
      ...p,
      top:
        rect.bottom + height + 6 > innerHeight - 8
          ? Math.max(8, rect.top - height - 6)
          : rect.bottom + 6,
    }));
    popover.current?.querySelector<HTMLElement>('button,a')?.focus();
    const close = (event: Event) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !popover.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const scroll = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', scroll);
    window.addEventListener('scroll', scroll);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', scroll);
      window.removeEventListener('scroll', scroll);
    };
  }, [open]);
  return (
    <span className="cabinet-menu">
      <button
        ref={trigger}
        className="cabinet-menu-trigger"
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          const rect = trigger.current!.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(innerWidth - 226, rect.right - 218)),
            top: rect.bottom + 6,
          });
          setOpen(!open);
        }}
      >
        <MoreHorizontal size={20} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popover}
            className="cabinet-popover"
            style={{
              left: position.left,
              top: position.top,
              maxHeight: `calc(100dvh - ${position.top + 8}px)`,
            }}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button,a')) setOpen(false);
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}
export function DeleteEntry({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const { remove } = useApp();
  return (
    <Confirm
      title="Удалить запись?"
      text={`«${entry.data.title}» будет удалена. Исходные файлы останутся на сервере.`}
      onClose={onClose}
      onConfirm={() => remove(entry)}
    />
  );
}
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'purple',
}: {
  icon: any;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className={`cabinet-stat ${tone}`}>
      <span className={`round-icon ${tone}`}>
        <Icon size={27} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </div>
  );
}
export function Privacy({ children = 'Видно только вам' }: { children?: ReactNode }) {
  return (
    <p className="cabinet-privacy">
      <LockKeyhole size={16} />
      {children}
    </p>
  );
}
export function useAssets(ids: string[]) {
  const [assets, setAssets] = useState<Asset[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setAssets([]);
    setError('');
    Promise.all(
      ids.map((id) =>
        api<Asset>(`/files/${id}/meta`).catch((e) => {
          if (active) setError(e.message);
          return null;
        }),
      ),
    ).then((items) => {
      if (active) setAssets(items.filter((a): a is Asset => !!a));
    });
    return () => {
      active = false;
    };
  }, [ids.join(',')]);
  return { assets, error };
}
export function FilePreview({ ids, title = 'Файл' }: { ids: string[]; title?: string }) {
  const [selected, setSelected] = useState(''),
    [error, setError] = useState('');
  const { assets, error: loadError } = useAssets(ids),
    asset = assets.find((a) => a.id === selected) || assets[0];
  useEffect(() => {
    setError('');
  }, [asset?.id]);
  if (!ids.length)
    return (
      <Empty
        icon={FileText}
        title="Файл не прикреплён"
        text="Текст работы и доступные действия показаны рядом."
      />
    );
  if (!asset)
    return loadError ? (
      <FormError error={loadError} />
    ) : (
      <div className="cabinet-file-loading">Загружаем файл…</div>
    );
  return (
    <div className="cabinet-preview">
      <div className="cabinet-preview-head">
        <FileText size={21} />
        <strong>{asset.name || title}</strong>
        <Badge tone={asset.mime === 'application/pdf' ? 'peach' : 'blue'}>
          {asset.mime === 'application/pdf' ? 'PDF' : 'Изображение'}
        </Badge>
      </div>
      {assets.length > 1 && (
        <select
          aria-label="Выбрать файл для просмотра"
          value={asset.id}
          onChange={(e) => setSelected(e.target.value)}
        >
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {asset.mime === 'application/pdf' ? (
        <Suspense fallback={<div className="cabinet-file-loading">Загружаем PDF…</div>}>
          <PdfPreview key={asset.id} id={asset.id} name={asset.name} />
        </Suspense>
      ) : (
        <img
          src={fileUrl(asset.id)}
          alt={asset.name}
          onError={() => setError('Не удалось показать изображение.')}
        />
      )}
      <FormError error={error} />
      <FormError error={loadError} />
      <div className="button-row">
        <a className="btn btn-primary" href={fileUrl(asset.id)} target="_blank" rel="noreferrer">
          <ExternalLink size={17} />
          Открыть
        </a>
        <a className="btn btn-secondary" href={fileUrl(asset.id, true)}>
          <Download size={17} />
          Скачать
        </a>
      </div>
    </div>
  );
}
export function workStatus(entry: Entry) {
  return entry.data.status === 'assigned' && entry.data.feedback?.trim()
    ? 'revision'
    : entry.data.status;
}
export const workLabels: Record<string, string> = {
  submitted: 'На проверке',
  assigned: 'Выдано',
  draft: 'Черновик ответа',
  revision: 'Нужна доработка',
  reviewed: 'Проверено',
};
export function WorkBadge({ entry }: { entry: Entry }) {
  const status = workStatus(entry);
  return (
    <Badge tone={status === 'reviewed' ? 'mint' : status === 'submitted' ? 'peach' : 'purple'}>
      {workLabels[status]}
    </Badge>
  );
}
