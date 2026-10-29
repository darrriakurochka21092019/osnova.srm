import type { Asset } from '../../../packages/contracts';
export async function api<T = any>(url: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api/v1${url}`, {
    credentials: 'same-origin',
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith('/auth/') && url !== '/me')
      window.dispatchEvent(new Event('session-expired'));
    const error = new Error(data.error || 'Не удалось выполнить запрос') as Error & {
      status: number;
    };
    error.status = response.status;
    throw error;
  }
  return data;
}
export async function upload(
  file: File | Blob,
  options: { boardId?: string; excalidrawId?: string; name?: string } = {},
): Promise<Asset> {
  const body = new FormData();
  if (options.boardId) body.append('boardId', options.boardId);
  if (options.excalidrawId) body.append('excalidrawId', options.excalidrawId);
  body.append('file', file, options.name || (file instanceof File ? file.name : 'Изображение.png'));
  return api('/files', body);
}
// Decode locally: fetch(data:) is blocked by the application's connect-src policy.
export function dataUrlBlob(value: string): Blob {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) throw new Error('Некорректное изображение доски');
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}
export const fileUrl = (id: string, download = false) =>
  `/api/v1/files/${id}${download ? '?download=1' : ''}`;
export const money = (n: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n);
export const date = (value: string | Date, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    ...options,
  }).format(new Date(value));
export const localInput = (value: string | Date) =>
  new Date(new Date(value).getTime() + 3 * 3600000).toISOString().slice(0, 16);
export const fromLocalInput = (value: string) => new Date(`${value}:00+03:00`).toISOString();
export const todayKey = () => localInput(new Date()).slice(0, 10);
export const statusLabels: Record<string, string> = {
  planned: 'Запланирован',
  live: 'Идёт урок',
  completed: 'Проведён',
  cancelled: 'Отменён',
  rescheduled: 'Перенесён',
  assigned: 'К выполнению',
  draft: 'Черновик',
  submitted: 'На проверке',
  reviewed: 'Проверено',
  active: 'Занимается',
  paused: 'Пауза',
  mastered: 'Освоено',
  repeat: 'Повторить',
  learning: 'Изучаем',
  signed: 'Подписан',
  archived: 'В архиве',
};
