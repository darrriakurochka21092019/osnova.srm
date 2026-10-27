import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToCanvas,
  getCommonBounds,
  restoreElements,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, BinaryFiles } from '@excalidraw/excalidraw/types';
import { io } from 'socket.io-client';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Download,
  History,
  Users,
  X,
  Pencil,
  Layers,
  FileText,
  Check,
  WifiOff,
  LoaderCircle,
  Highlighter,
  PenLine,
  CircleHelp,
  Type,
  StickyNote,
  Grid2X2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import '@excalidraw/excalidraw/index.css';
import '../board/board.css';
import { api, date, fileUrl, upload } from '../api';
import { useApp } from '../store';
import {
  Avatar,
  Badge,
  Busy,
  Button,
  Confirm,
  Empty,
  Field,
  FormError,
  Modal,
  SaveButton,
} from '../ui';
import { InviteDialog } from './editors';
import { readDraft, writeDraft, type OfflineDraft } from '../board/offline';
import type {
  Asset,
  Board,
  BoardBackground,
  PresentationSlide,
  Page,
} from '../../../../packages/contracts';

import { backgrounds, backgroundStyle, paintBackground } from '../board/background';
import { captureCanvas } from '../board/canvas';
import {
  presentationOf,
  projectCanvas,
  slideIsHidden,
  changedElement,
} from '../../../../packages/contracts/canvas';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
(window as any).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';

type SaveState = 'saved' | 'saving' | 'offline' | 'error';
type EditorHandle = {
  flush: () => Promise<void>;
  export: (type: 'png' | 'pdf' | 'scene') => Promise<void>;
  addMedia: (elements: any[], files: any[]) => void;
  placement: () => { x: number; y: number };
  addTemplate: (kind: string) => void;
  setPen: (highlight: boolean) => void;
  revision: () => number;
};
const fingerprint = (e?: any) => (e ? `${e.version}:${e.versionNonce}` : '');
const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[/\\:*?"<>|]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Не удалось подготовить изображение'))),
      'image/png',
    ),
  );
}

export default function BoardRoom() {
  const { id } = useParams(),
    [search, setSearch] = useSearchParams(),
    { user, toast, refresh } = useApp();
  const [board, setBoard] = useState<Board | null>(null),
    [loadError, setLoadError] = useState(''),
    [save, setSave] = useState<SaveState>('saved'),
    [saveError, setSaveError] = useState(''),
    [backgroundBusy, setBackgroundBusy] = useState(false),
    [backgroundOpen, setBackgroundOpen] = useState(false),
    [inviteOpen, setInviteOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [rename, setRename] = useState(false),
    [importStatus, setImportStatus] = useState(''),
    [assets, setAssets] = useState<Asset[] | null>(null),
    [help, setHelp] = useState(false),
    [editorReady, setEditorReady] = useState(false),
    [peers, setPeers] = useState<{ id: string; name: string }[]>([]),
    [conflict, setConflict] = useState<{ elements: any[]; files: any } | null>(null);
  const handle = useRef<EditorHandle | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    importing = useRef(false);
  const load = useCallback(async () => {
    try {
      let b = await api<Board>(`/boards/${id}`);
      if (!b.canvas_page_id) b = { ...b, ...(await api<Board>(`/boards/${id}/canvas`, {})) };
      setBoard(b);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const readOnly = board?.permission === 'view' || !!board?.archived;
  const importFile = useCallback(
    async (file: File) => {
      if (!board || readOnly || importing.current) return;
      if (!handle.current) {
        toast('Холст ещё загружается. Повторите загрузку через несколько секунд');
        return;
      }
      importing.current = true;
      setImportStatus('Сохраняем исходный файл…');
      try {
        await handle.current.flush();
        const original = await upload(file, { boardId: board.id });
        const position = handle.current.placement();
        if (file.type === 'application/pdf') {
          const loadingTask = getDocument({
            data: new Uint8Array(await file.arrayBuffer()),
            standardFontDataUrl: '/pdf-assets/standard_fonts/',
            wasmUrl: '/pdf-assets/wasm/',
            cMapUrl: '/pdf-assets/cmaps/',
            cMapPacked: true,
          });
          const pdf = await loadingTask.promise;
          try {
            if (pdf.numPages > 30)
              throw new Error('В одной презентации должно быть не больше 30 слайдов');
            const slides: PresentationSlide[] = [],
              firstFiles: any[] = [];
            let frameWidth = 0,
              frameHeight = 0;
            for (let n = 1; n <= pdf.numPages; n++) {
              setImportStatus(`Готовим слайд ${n} из ${pdf.numPages}…`);
              const page = await pdf.getPage(n),
                originalViewport = page.getViewport({ scale: 1.75 }),
                canvas = document.createElement('canvas');
              if (n === 1) {
                frameWidth = Math.ceil(originalViewport.width);
                frameHeight = Math.ceil(originalViewport.height);
              }
              const fit = Math.min(
                  frameWidth / originalViewport.width,
                  frameHeight / originalViewport.height,
                ),
                viewport = page.getViewport({ scale: 1.75 * fit });
              canvas.width = frameWidth;
              canvas.height = frameHeight;
              await page.render({
                canvas,
                viewport,
                background: '#fff',
                transform: [
                  1,
                  0,
                  0,
                  1,
                  (frameWidth - viewport.width) / 2,
                  (frameHeight - viewport.height) / 2,
                ],
              }).promise;
              const blob = await canvasBlob(canvas),
                fileId = crypto.randomUUID();
              await upload(blob, {
                boardId: board.id,
                excalidrawId: fileId,
                name: `pdf-page-${n}-${file.name}.png`,
              });
              slides.push({ fileId, width: frameWidth / 1.75, height: frameHeight / 1.75 });
              if (n === 1)
                firstFiles.push({
                  id: fileId,
                  mimeType: 'image/png',
                  dataURL: await blobDataUrl(blob),
                  created: Date.now(),
                });
              canvas.width = 0;
              canvas.height = 0;
              page.cleanup();
            }
            const scale = Math.min(960 / slides[0].width, 640 / slides[0].height, 1.5);
            const elements = convertToExcalidrawElements([
              {
                type: 'image',
                ...position,
                width: slides[0].width * scale,
                height: slides[0].height * scale,
                fileId: slides[0].fileId as any,
                locked: false,
                status: 'saved',
                customData: {
                  presentation: {
                    sourceId: original.id,
                    title: file.name.replace(/\.pdf$/i, ''),
                    slides,
                    slideIndex: 0,
                  },
                },
              },
            ]);
            handle.current.addMedia(elements, firstFiles);
            toast(`Презентация добавлена: ${slides.length} слайдов`);
          } finally {
            await loadingTask.destroy();
          }
        } else {
          const fileId = crypto.randomUUID();
          await upload(file, { boardId: board.id, excalidrawId: fileId, name: file.name });
          const dataURL = await blobDataUrl(file),
            image = new Image();
          image.src = dataURL;
          await image.decode();
          const scale = Math.min(960 / image.width, 640 / image.height, 1);
          const elements = convertToExcalidrawElements([
            {
              type: 'image',
              ...position,
              width: image.width * scale,
              height: image.height * scale,
              fileId: fileId as any,
              locked: false,
              status: 'saved',
              customData: { sourceId: original.id },
            },
          ]);
          handle.current.addMedia(elements, [
            { id: fileId, mimeType: file.type, dataURL, created: Date.now() },
          ]);
          toast('Изображение добавлено на холст');
        }
        await refresh();
      } catch (e) {
        toast((e as Error).message);
      } finally {
        importing.current = false;
        setImportStatus('');
      }
    },
    [board, readOnly],
  );
  useEffect(() => {
    const assetId = search.get('import');
    if (!board || !editorReady || !assetId || importing.current) return;
    setSearch({}, { replace: true });
    fetch(fileUrl(assetId))
      .then(async (r) => {
        if (!r.ok) throw new Error('Не удалось открыть материал');
        const b = await r.blob();
        return new File(
          [b],
          b.type === 'application/pdf' ? 'Учебный материал.pdf' : 'Учебный материал.png',
          { type: b.type },
        );
      })
      .then(importFile)
      .catch((e) => toast(e.message));
  }, [board?.id, editorReady, search]);
  const changeBackground = async (background: BoardBackground) => {
    if (!board || readOnly) return;
    setBackgroundBusy(true);
    try {
      const updated = await api<Board>(`/boards/${board.id}`, { background }, 'PATCH');
      setBoard((b) => (b ? { ...b, background: updated.background } : b));
      setBackgroundOpen(false);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBackgroundBusy(false);
    }
  };
  if (loadError)
    return (
      <div className="fatal">
        <FormError error={loadError} />
        <Link to="/boards" className="btn btn-primary">
          К доскам
        </Link>
      </div>
    );
  if (!board || !board.canvas_page_id) return <Busy />;
  return (
    <div className="board-room">
      <header className="board-topbar">
        <Link to="/boards" className="icon-btn" aria-label="Назад к доскам">
          <ArrowLeft size={21} />
        </Link>
        <span className="board-logo">
          о<span>.</span>
        </span>
        <div className="board-title">
          <button disabled={user.role !== 'teacher'} onClick={() => setRename(true)}>
            {board.title}
            <Pencil size={13} />
          </button>
          <span className={`save-state ${backgroundBusy ? 'saving' : save}`} role="status">
            {save === 'saved' && !backgroundBusy ? (
              <Check size={12} />
            ) : save === 'saving' || backgroundBusy ? (
              <LoaderCircle size={12} className="spin" />
            ) : (
              <WifiOff size={12} />
            )}{' '}
            {backgroundBusy
              ? 'Сохраняем фон…'
              : save === 'saved'
                ? 'Сохранено'
                : save === 'saving'
                  ? 'Сохраняем…'
                  : save === 'offline'
                    ? 'Нет связи · правки на устройстве'
                    : 'Не удалось сохранить'}
            {readOnly ? ' · Только просмотр' : ''}
          </span>
        </div>
        <div className="board-top-actions">
          <div className="board-avatars">
            <Avatar small name={user.name} />
            {peers.slice(0, 3).map((p) => (
              <Avatar key={p.id} small name={p.name} color="mint" />
            ))}
          </div>
          <button className="icon-btn" aria-label="Помощь по доске" onClick={() => setHelp(true)}>
            <CircleHelp size={20} />
          </button>
          <Button variant="secondary" onClick={() => setExportOpen(true)}>
            <Download size={16} />
            <span>Экспорт</span>
          </Button>
          {user.role === 'teacher' && (
            <Button disabled={board.archived} onClick={() => setInviteOpen(true)}>
              <Users size={16} />
              <span>Пригласить</span>
            </Button>
          )}
        </div>
      </header>
      <div className="board-actionbar">
        <div className="button-row">
          {!readOnly && (
            <>
              <button
                className="board-action"
                onClick={() => fileInput.current?.click()}
                disabled={!!importStatus || !editorReady}
              >
                <Upload size={16} />
                Загрузить PDF или изображение
              </button>
              <button className="board-action" onClick={() => handle.current?.addTemplate('text')}>
                <Type size={16} />
                Текст
              </button>
              <button className="board-action" onClick={() => handle.current?.addTemplate('note')}>
                <StickyNote size={16} />
                Заметка
              </button>
              <button className="board-action" onClick={() => handle.current?.setPen(false)}>
                <PenLine size={16} />
                Ручка
              </button>
              <button className="board-action" onClick={() => handle.current?.setPen(true)}>
                <Highlighter size={16} />
                Маркер
              </button>
            </>
          )}
        </div>
        <div className="button-row">
          <button
            className={`board-action ${backgroundOpen ? 'selected' : ''}`}
            onClick={() => setBackgroundOpen(!backgroundOpen)}
            aria-expanded={backgroundOpen}
          >
            <Grid2X2 size={16} />
            Фон
          </button>
          <button
            className="board-action"
            onClick={async () => {
              try {
                setAssets(await api(`/boards/${board.id}/files`));
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            <Layers size={16} />
            Файлы
          </button>
          {user.role === 'teacher' && (
            <button className="board-action" onClick={() => setHistoryOpen(true)}>
              <History size={16} />
              История
            </button>
          )}
          <span className="board-participant-count">{peers.length + 1} на доске</span>
        </div>
      </div>
      {backgroundOpen && (
        <div className="background-picker" role="dialog" aria-label="Фон доски">
          <div className="background-picker-head">
            <strong>Фон доски</strong>
            <button
              className="icon-btn"
              aria-label="Закрыть выбор фона"
              onClick={() => setBackgroundOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="background-options">
            {backgrounds.map((b) => (
              <button
                key={b.id}
                className={`background-option ${board.background === b.id ? 'active' : ''}`}
                disabled={readOnly || backgroundBusy}
                onClick={() => changeBackground(b.id)}
                aria-pressed={board.background === b.id}
              >
                <i style={backgroundStyle(b.id)} />
                <span>{b.title}</span>
                {board.background === b.id && <Check size={14} />}
              </button>
            ))}
          </div>
          {readOnly && <p className="muted">Фон выбирает участник с правом редактирования.</p>}
        </div>
      )}
      {saveError && (
        <div className="board-warning" role="alert">
          {saveError}
          <button onClick={() => handle.current?.flush()}>Повторить сохранение</button>
        </div>
      )}
      {conflict && (
        <div className="board-warning" role="alert">
          Другой участник изменил тот же объект. Ваш вариант можно скачать.
          <Button
            variant="secondary"
            onClick={() =>
              download(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        type: 'excalidraw',
                        version: 2,
                        source: 'osnova-conflict',
                        elements: conflict.elements,
                        files: conflict.files,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: 'application/json' },
                ),
                'osnova-conflict.excalidraw',
              )
            }
          >
            Скачать мой вариант
          </Button>
          <button
            className="icon-btn"
            aria-label="Закрыть сообщение о конфликте"
            onClick={() => setConflict(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="board-body">
        <div className="canvas-shell">
          <PageEditor
            key={board.canvas_page_id}
            board={board}
            pageId={board.canvas_page_id}
            readOnly={readOnly}
            handleRef={handle}
            onSave={(state, error) => {
              setSave(state);
              setSaveError(error || '');
            }}
            onPeers={setPeers}
            onConflict={setConflict}
            onPages={load}
            onReady={() => setEditorReady(true)}
            onBackground={(background) => setBoard((b) => (b ? { ...b, background } : b))}
          />
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
      {importStatus && (
        <div className="import-progress" role="status">
          <LoaderCircle className="spin" size={20} />
          <div>
            <strong>{importStatus}</strong>
            <small>Все слайды останутся внутри одной презентации на холсте</small>
          </div>
        </div>
      )}
      {rename && (
        <Rename
          title={board.title}
          onClose={() => setRename(false)}
          onSave={async (title) => {
            await api(`/boards/${board.id}`, { title }, 'PATCH');
            await load();
          }}
        />
      )}
      {inviteOpen && <BoardInvites boardId={board.id} onClose={() => setInviteOpen(false)} />}
      {historyOpen && (
        <BoardHistory
          pageId={board.canvas_page_id}
          revision={() => handle.current?.revision() || 0}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {exportOpen && (
        <Modal title="Экспорт холста" onClose={() => setExportOpen(false)}>
          <p className="muted">
            PNG и PDF включают видимые слайды, пометки и выбранный фон. Редактируемая сцена хранит
            все слайды и заметки презентаций.
          </p>
          <div className="export-options">
            {[
              ['png', 'Изображение PNG'],
              ['pdf', 'Документ PDF'],
              ['scene', 'Редактируемая сцена .excalidraw'],
            ].map(([type, label]) => (
              <Button
                key={type}
                variant="secondary"
                onClick={async () => {
                  try {
                    await handle.current?.export(type as any);
                    setExportOpen(false);
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                <Download size={18} />
                {label}
              </Button>
            ))}
          </div>
        </Modal>
      )}
      {assets && (
        <Modal title="Исходные материалы доски" onClose={() => setAssets(null)}>
          {assets
            .filter((f) => !f.name.startsWith('pdf-page-'))
            .map((f) => (
              <a className="asset-row" key={f.id} href={fileUrl(f.id, true)}>
                <FileText size={19} />
                <span>
                  {f.name}
                  <small>{(f.size / 1024 / 1024).toFixed(1)} МБ</small>
                </span>
                <Download size={18} />
              </a>
            ))}
          {!assets.length && <Empty title="Материалы ещё не загружены" />}
        </Modal>
      )}
      {help && (
        <Modal title="Общий холст для любого предмета" onClose={() => setHelp(false)}>
          <p>
            На бесконечном холсте можно размещать тексты, изображения, схемы и несколько
            PDF-презентаций. Перемещайте объекты и меняйте их размер инструментом выделения.
          </p>
          <p>
            Переключайте слайды кнопками под презентацией. Пометки внутри слайда сохраняются
            отдельно для него и возвращаются при переходе назад. Изменение слайда видно всем
            участникам с доступом к доске.
          </p>
          <p>
            Выберите «Фон»: белый холст, клетка, линии или точки. Рисунок фона масштабируется вместе
            с холстом и включается в экспорт.
          </p>
          <div className="help-shortcuts">
            <span>
              <kbd>V</kbd> Выделение
            </span>
            <span>
              <kbd>P</kbd> Ручка
            </span>
            <span>
              <kbd>T</kbd> Текст
            </span>
            <span>
              <kbd>E</kbd> Ластик
            </span>
            <span>
              <kbd>Пробел</kbd> Перемещение
            </span>
            <span>
              <kbd>Ctrl Z</kbd> Отмена
            </span>
          </div>
          <p className="muted">
            «Сохранено» появляется после ответа сервера. При потере связи дождитесь отправки
            локальных правок перед закрытием браузера.
          </p>
        </Modal>
      )}
    </div>
  );
}

function Rename({
  title,
  onClose,
  onSave,
}: {
  title: string;
  onClose: () => void;
  onSave: (t: string) => Promise<void>;
}) {
  const [value, setValue] = useState(title),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Переименовать" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(value);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Название">
          <input
            value={value}
            required
            maxLength={200}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <FormError error={error} />
        <div className="form-actions">
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  );
}

function PageEditor({
  board,
  pageId,
  readOnly,
  handleRef,
  onSave,
  onPeers,
  onConflict,
  onPages,
  onReady,
  onBackground,
}: {
  board: Board;
  pageId: string;
  readOnly: boolean;
  handleRef: React.MutableRefObject<EditorHandle | null>;
  onSave: (state: SaveState, error?: string) => void;
  onPeers: (p: any[]) => void;
  onConflict: (data: { elements: any[]; files: any }) => void;
  onPages: () => Promise<void>;
  onReady: () => void;
  onBackground: (background: BoardBackground) => void;
}) {
  const { user, toast } = useApp();
  const [initial, setInitial] = useState<any>(null),
    [error, setError] = useState(''),
    [editor, setEditor] = useState<ExcalidrawImperativeAPI | null>(null),
    [view, setView] = useState({ scrollX: 0, scrollY: 0, zoom: 1, width: 0, height: 0 }),
    [decks, setDecks] = useState<any[]>([]),
    [switching, setSwitching] = useState('');
  const deckStamp = useRef('');
  const pointerDown = useRef(false),
    newElements = useRef(new Set<string>()),
    dragStart = useRef<any[] | null>(null);
  const base = useRef(new Map<string, any>()),
    current = useRef<any[]>([]),
    fileData = useRef<BinaryFiles>({}),
    knownFiles = useRef(new Set<string>()),
    revision = useRef(0),
    ready = useRef(false),
    running = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    mounted = useRef(true),
    pendingOperation = useRef<{ id: string; changes: any[] } | null>(null),
    ownOperations = useRef(new Set<string>()),
    socketRef = useRef<ReturnType<typeof io> | null>(null),
    collaborators = useRef(new Map<string, any>()),
    storageOkay = useRef(true);
  const key = `${user.id}:${pageId}`;
  const publishDecks = () => {
    const next = current.current.filter((e) => !e.isDeleted && presentationOf(e));
    const stamp = next.map((e) => `${e.id}:${fingerprint(e)}`).join('|');
    if (deckStamp.current !== stamp) {
      deckStamp.current = stamp;
      setDecks(next);
    }
  };
  const renderScene = (
    captureUpdate: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction] = CaptureUpdateAction.NEVER,
  ) => {
    const native = new Map(editor?.getSceneElementsIncludingDeleted().map((e) => [e.id, e]));
    editor?.updateScene({
      // Keep native references for unchanged objects so autosave/remote edits cannot interrupt a stroke.
      elements: restoreElements(projectCanvas(current.current), null).map((e) => {
        const existing = native.get(e.id);
        return existing &&
          fingerprint(existing) === fingerprint(e) &&
          existing.isDeleted === e.isDeleted
          ? existing
          : e;
      }),
      captureUpdate,
    });
    publishDecks();
  };
  const diff = () =>
    current.current.filter((e) => fingerprint(e) !== fingerprint(base.current.get(e.id)));
  const persist = async () => {
    if (readOnly) return;
    try {
      await writeDraft(
        key,
        diff().length || pendingOperation.current
          ? {
              elements: current.current,
              base: [...base.current.values()],
              files: fileData.current,
              pending: pendingOperation.current,
            }
          : null,
      );
      storageOkay.current = true;
    } catch {
      storageOkay.current = false;
      onSave(
        'error',
        'Браузер не смог сохранить локальную очередь. Не закрывайте страницу до подтверждения сервера.',
      );
    }
  };
  const loadFiles = async (elements: any[], apiEditor?: ExcalidrawImperativeAPI) => {
    const needed = new Set(
      elements.filter((e) => e.type === 'image' && !e.isDeleted).map((e) => e.fileId),
    );
    if (!needed.size) return;
    const assets = await api<Asset[]>(`/boards/${board.id}/files`);
    for (const f of assets) if (f.excalidraw_id) knownFiles.current.add(f.excalidraw_id);
    const added: any[] = [];
    for (const f of assets)
      if (
        f.excalidraw_id &&
        needed.has(f.excalidraw_id) &&
        !fileData.current[f.excalidraw_id as any]
      ) {
        const r = await fetch(fileUrl(f.id));
        if (!r.ok) throw new Error('Не удалось открыть изображение доски');
        const data = {
          id: f.excalidraw_id,
          mimeType: f.mime,
          dataURL: await blobDataUrl(await r.blob()),
          created: Date.now(),
        };
        fileData.current[f.excalidraw_id as any] = data as any;
        added.push(data);
      }
    if (added.length) apiEditor?.addFiles(added);
  };
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const p = await api<Page>(`/pages/${pageId}/snapshot`);
        let scene = (p.scene || []) as any[];
        base.current = new Map(scene.map((e) => [e.id, e]));
        revision.current = p.revision;
        let draft: OfflineDraft | undefined;
        try {
          draft = await readDraft(key);
        } catch {
          storageOkay.current = false;
        }
        if (draft && !readOnly) {
          const oldBase = new Map(draft.base.map((e) => [e.id, e])),
            localDirty = draft.elements.filter(
              (e) => fingerprint(e) !== fingerprint(oldBase.get(e.id)),
            );
          const merged = new Map(scene.map((e) => [e.id, e]));
          for (const e of localDirty) {
            merged.set(e.id, e);
            if (oldBase.has(e.id)) base.current.set(e.id, oldBase.get(e.id));
            else base.current.delete(e.id);
          }
          scene = [...merged.values()];
          fileData.current = draft.files;
          pendingOperation.current = draft.pending || null;
        }
        const recovery = await readDraft(`${key}:conflict`).catch(() => undefined);
        if (recovery?.elements.length)
          onConflict({ elements: recovery.elements, files: recovery.files });
        current.current = scene;
        await loadFiles(scene);
        publishDecks();
        if (!mounted.current) return;
        setInitial({
          elements: restoreElements(projectCanvas(scene), null),
          appState: {
            viewBackgroundColor: 'transparent',
            currentItemFontFamily: 2,
            currentItemStrokeColor: '#252846',
            currentItemRoughness: 0,
            gridSize: 24,
            gridModeEnabled: false,
          },
          files: fileData.current,
          scrollToContent: true,
        });
        onSave(diff().length ? 'saving' : 'saved');
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      handleRef.current = null;
      void persist();
    };
  }, [pageId]);
  const applyRemote = async (payload: any) => {
    if (ownOperations.current.has(payload.operationId)) return;
    revision.current = Math.max(revision.current, payload.revision || 0);
    await loadFiles(payload.elements, editor || undefined);
    const scene = new Map(current.current.map((e) => [e.id, e]));
    for (const e of payload.elements) {
      const known = base.current.get(e.id);
      if (known && e.version <= known.version) continue;
      const local = scene.get(e.id);
      if (fingerprint(local) === fingerprint(known)) {
        base.current.set(e.id, e);
        scene.set(e.id, e);
      }
    }
    current.current = [...scene.values()];
    renderScene();
  };
  const flush = async () => {
    if (readOnly || !ready.current || running.current) return;
    clearTimeout(timer.current);
    const dirty = diff();
    if (!dirty.length && !pendingOperation.current) {
      onSave('saved');
      await persist();
      return;
    }
    if (!navigator.onLine) {
      onSave('offline');
      await persist();
      return;
    }
    running.current = true;
    onSave('saving');
    try {
      for (const e of dirty)
        if (e.type === 'image' && !e.isDeleted)
          for (const fileId of presentationOf(e)?.slides.map((s) => s.fileId) || [e.fileId]) {
            if (knownFiles.current.has(fileId)) continue;
            const f = fileData.current[fileId as keyof BinaryFiles];
            if (!f) throw new Error('Изображение ещё загружается');
            const blob = await (await fetch(f.dataURL)).blob();
            await upload(blob, {
              boardId: board.id,
              excalidrawId: fileId,
              name: 'Изображение доски.png',
            });
            knownFiles.current.add(fileId);
          }
      const operation = pendingOperation.current || {
        id: crypto.randomUUID(),
        changes: dirty.slice(0, 1000).map((element) => ({
          element,
          baseVersion: base.current.get(element.id)?.version ?? null,
        })),
      };
      pendingOperation.current = operation;
      ownOperations.current.add(operation.id);
      await persist();
      const result = await api(`/pages/${pageId}/operations`, {
        operationId: operation.id,
        changes: operation.changes,
      });
      const scene = new Map(current.current.map((e) => [e.id, e]));
      const attempted = new Map(operation.changes.map((c) => [c.element.id, c.element]));
      for (const e of result.elements) {
        base.current.set(e.id, e);
        if (fingerprint(scene.get(e.id)) === fingerprint(attempted.get(e.id))) scene.set(e.id, e);
      }
      if (result.conflicts.length) {
        const lost = result.conflicts.map((e: any) => scene.get(e.id)).filter(Boolean);
        onConflict({ elements: lost, files: fileData.current });
        await writeDraft(`${key}:conflict`, { elements: lost, base: [], files: fileData.current });
        for (const e of result.conflicts) {
          base.current.set(e.id, e);
          scene.set(e.id, e);
        }
      }
      current.current = [...scene.values()];
      revision.current = Math.max(revision.current, result.revision);
      pendingOperation.current = null;
      renderScene();
      await persist();
      onSave(diff().length ? 'saving' : 'saved');
    } catch (e) {
      const status = (e as any).status;
      const offline = !navigator.onLine || !status;
      onSave(offline ? 'offline' : 'error', (e as Error).message);
      if (status && status < 500) {
        pendingOperation.current = null;
        if (status === 403 || status === 401) ready.current = false;
      }
    } finally {
      running.current = false;
      if (mounted.current && ready.current && diff().length)
        timer.current = setTimeout(() => void flush(), 2000);
    }
  };
  useEffect(() => {
    if (!editor || !initial) return;
    ready.current = false;
    let initialFrame = 0;
    const initialize = () => {
      if (editor.getAppState().isLoading) {
        initialFrame = requestAnimationFrame(initialize);
        return;
      }
      editor.addFiles(Object.values(fileData.current));
      renderScene();
      ready.current = true;
      onReady();
      const visible = projectCanvas(current.current).filter((e) => !e.isDeleted);
      if (visible.length)
        editor.scrollToContent(restoreElements(visible, null), {
          fitToContent: true,
          viewportZoomFactor: 0.85,
        });
      void flush();
    };
    initialFrame = requestAnimationFrame(initialize);
    const stopPointerDown = editor.onPointerDown(() => {
      pointerDown.current = true;
      dragStart.current = current.current.map((e) => ({
        ...e,
        ...(e.points ? { points: e.points.map((point: number[]) => [...point]) } : {}),
      }));
    });
    let pointerFrame = 0;
    const stopPointerUp = editor.onPointerUp(() => {
      pointerDown.current = false;
      pointerFrame = requestAnimationFrame(() => {
        if (readOnly || !ready.current) return;
        const rendered = editor.getSceneElementsIncludingDeleted();
        current.current = captureCanvas(rendered, dragStart.current || current.current, {
          attachIds: newElements.current,
        }).map((e) => ({ ...e }));
        dragStart.current = null;
        newElements.current.clear();
        renderScene();
        void persist();
        void flush();
      });
    });
    const socket = io({ withCredentials: true });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('join-page', { pageId }, async (result: any) => {
        if (result?.error) {
          onSave('error', result.error);
          return;
        }
        for (const p of result.peers || []) collaborators.current.set(p.id, { username: p.name });
        onPeers(result.peers || []);
        try {
          const p = await api<Page>(`/pages/${pageId}/snapshot`);
          await applyRemote({ elements: p.scene || [], revision: p.revision });
          await flush();
        } catch (e) {
          onSave('offline', (e as Error).message);
        }
      });
    });
    socket.on('pages-updated', () => {
      void onPages();
    });
    socket.on('canvas-updated', () => {
      void onPages();
    });
    socket.on('board-background', (payload) => onBackground(payload.background));
    socket.on('scene-update', (payload) => {
      void applyRemote(payload).catch((e) => onSave('error', e.message));
    });
    socket.on('presence', (p) => {
      if (p.joined) collaborators.current.set(p.id, { username: p.name });
      else collaborators.current.delete(p.id);
      onPeers([...collaborators.current].map(([id, p]) => ({ id, name: p.username })));
      editor.updateScene({ collaborators: collaborators.current as any });
    });
    socket.on('cursor', (p) => {
      collaborators.current.set(p.id, {
        username: p.name,
        pointer: { x: p.x, y: p.y, tool: 'pointer' },
        color: { background: '#dfeee7', stroke: '#2e8a69' },
        state: 'active',
      });
      editor.updateScene({ collaborators: collaborators.current as any });
    });
    socket.on('disconnect', () => {
      onPeers([]);
      if (diff().length) onSave('offline');
    });
    socket.on('access-revoked', () => {
      ready.current = false;
      cancelAnimationFrame(initialFrame);
      stopPointerDown();
      stopPointerUp();
      cancelAnimationFrame(pointerFrame);
      onSave('error', 'Доступ к доске закрыт. Локальные изменения сохранены на устройстве.');
      editor.updateScene({ appState: { viewModeEnabled: true } });
    });
    const online = () => {
      void flush();
    };
    const close = (e: BeforeUnloadEvent) => {
      if (diff().length || pendingOperation.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', close);
    return () => {
      ready.current = false;
      socket.disconnect();
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', close);
    };
  }, [editor, !!initial]);
  const changeSlide = async (id: string, index: number) => {
    if (readOnly || switching) return;
    const deck = current.current.find((e) => e.id === id),
      presentation = deck && presentationOf(deck);
    if (
      !presentation ||
      index < 0 ||
      index >= presentation.slides.length ||
      index === presentation.slideIndex
    )
      return;
    setSwitching(id);
    try {
      const next = changedElement(deck, {
        fileId: presentation.slides[index].fileId,
        customData: { ...deck.customData, presentation: { ...presentation, slideIndex: index } },
      });
      await loadFiles([next], editor || undefined);
      current.current = current.current.map((e) => (e.id === id ? next : e));
      renderScene(CaptureUpdateAction.IMMEDIATELY);
      void persist();
      void flush();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSwitching('');
    }
  };
  useEffect(() => {
    if (!editor) return;
    const add = (skeletons: any[]) => {
      const elements = convertToExcalidrawElements(skeletons);
      editor.updateScene({
        elements: [...editor.getSceneElementsIncludingDeleted(), ...elements],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      editor.scrollToContent(elements, { fitToContent: true });
    };
    const center = () => {
      const a = editor.getAppState();
      return {
        x: -a.scrollX + Math.min(120, a.width / 4) / a.zoom.value,
        y: -a.scrollY + 160 / a.zoom.value,
      };
    };
    handleRef.current = {
      flush,
      revision: () => revision.current,
      placement() {
        const visible = current.current.filter(
          (e) => !e.isDeleted && !slideIsHidden(e, current.current),
        );
        return {
          x: visible.length ? Math.max(...visible.map((e) => e.x + e.width)) + 120 : 80,
          y: 80,
        };
      },
      addMedia(elements, files) {
        editor.addFiles(files);
        for (const f of files) {
          fileData.current[f.id as keyof BinaryFiles] = f;
          knownFiles.current.add(f.id);
        }
        for (const element of elements)
          for (const slide of presentationOf(element)?.slides || [])
            knownFiles.current.add(slide.fileId);
        editor.updateScene({
          elements: [...editor.getSceneElementsIncludingDeleted(), ...elements],
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        editor.scrollToContent(elements, { fitToContent: true, viewportZoomFactor: 0.75 });
      },
      setPen(highlight) {
        editor.updateScene({
          appState: {
            currentItemOpacity: highlight ? 30 : 100,
            currentItemStrokeWidth: highlight ? 8 : 2,
            currentItemStrokeColor: highlight ? '#f0c348' : '#252846',
          },
        });
        editor.setActiveTool({ type: 'freedraw' });
      },
      addTemplate(kind) {
        const { x, y } = center();
        const text =
          kind === 'note'
            ? 'Заметка\n\nИдея, вопрос или важный вывод.'
            : 'Текстовый блок\n\nДважды нажмите, чтобы ввести текст.';
        add([
          {
            type: 'text',
            x,
            y,
            text,
            fontFamily: 2,
            fontSize: kind === 'note' ? 20 : 24,
            strokeColor: kind === 'note' ? '#2a8b69' : '#252846',
            roughness: 0,
          },
        ]);
      },
      async export(type) {
        const elements = editor.getSceneElements(),
          appState = editor.getAppState(),
          files = editor.getFiles();
        const name = board.title;
        if (type === 'scene') {
          const allSlides = current.current.flatMap((e) =>
            (presentationOf(e)?.slides || []).map((slide) => ({
              type: 'image',
              fileId: slide.fileId,
            })),
          );
          await loadFiles(allSlides, editor);
          download(
            new Blob(
              [
                JSON.stringify(
                  {
                    type: 'excalidraw',
                    version: 2,
                    source: 'osnova',
                    elements: current.current,
                    appState: { viewBackgroundColor: '#fff' },
                    osnova: { background: board.background || 'white' },
                    files: fileData.current,
                  },
                  null,
                  2,
                ),
              ],
              { type: 'application/json' },
            ),
            `${name}.excalidraw`,
          );
          return;
        }
        if (!elements.length) throw new Error('На холсте пока нет объектов для экспорта');
        const rendered = await exportToCanvas({
          elements,
          appState: {
            ...appState,
            exportBackground: false,
            exportWithDarkMode: false,
            exportScale: 1,
          },
          files,
          exportPadding: 24,
          getDimensions: (width: number, height: number) => ({ width, height, scale: 1 }),
        });
        const canvas = document.createElement('canvas');
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        const ctx = canvas.getContext('2d')!;
        const [minX, minY] = getCommonBounds(elements);
        paintBackground(
          ctx,
          canvas.width,
          canvas.height,
          board.background || 'white',
          24 - minX,
          24 - minY,
        );
        ctx.drawImage(rendered, 0, 0);
        const blob = await canvasBlob(canvas);
        if (type === 'png') download(blob, `${name}.png`);
        else {
          const pdf = await PDFDocument.create(),
            image = await pdf.embedPng(await blob.arrayBuffer()),
            scale = Math.min(1, 14400 / Math.max(image.width, image.height)),
            p = pdf.addPage([image.width * scale, image.height * scale]);
          p.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width * scale,
            height: image.height * scale,
          });
          download(
            new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' }),
            `${name}.pdf`,
          );
        }
      },
    };
  });
  if (error)
    return (
      <div className="fatal">
        <FormError error={error} />
        <Button onClick={() => location.reload()}>Повторить</Button>
      </div>
    );
  if (!initial) return <Busy />;
  return (
    <>
      <div
        className="canvas-paper"
        data-background={board.background || 'white'}
        style={backgroundStyle(board.background || 'white', view.zoom, view.scrollX, view.scrollY)}
      />
      <Excalidraw
        excalidrawAPI={setEditor}
        initialData={initial}
        langCode="ru-RU"
        theme="light"
        name={board.title}
        viewModeEnabled={readOnly}
        isCollaborating={true}
        validateEmbeddable={false}
        aiEnabled={false}
        UIOptions={{
          canvasActions: {
            loadScene: !readOnly,
            saveToActiveFile: false,
            export: false,
            changeViewBackgroundColor: false,
            toggleTheme: false,
          },
        }}
        onChange={(elements, state, files) => {
          setView((v) =>
            v.scrollX === state.scrollX &&
            v.scrollY === state.scrollY &&
            v.zoom === state.zoom.value &&
            v.width === state.width &&
            v.height === state.height
              ? v
              : {
                  scrollX: state.scrollX,
                  scrollY: state.scrollY,
                  zoom: state.zoom.value,
                  width: state.width,
                  height: state.height,
                },
          );
          if (!ready.current) return;
          if (state.gridModeEnabled) editor?.updateScene({ appState: { gridModeEnabled: false } });
          const priorIds = new Set(current.current.map((e) => e.id));
          for (const element of elements)
            if (!priorIds.has(element.id)) newElements.current.add(element.id);
          const captured = captureCanvas(elements, current.current, {
            attachNew: !pointerDown.current,
            attachIds: newElements.current,
            transform: !pointerDown.current,
          });
          for (const element of captured)
            if (element.customData?.slideAnnotation) newElements.current.delete(element.id);
          const next = new Map<string, any>(captured.map((e) => [e.id, e]));
          if (!readOnly)
            for (const e of base.current.values())
              if (!next.has(e.id))
                next.set(
                  e.id,
                  slideIsHidden(e, current.current)
                    ? e
                    : {
                        ...e,
                        isDeleted: true,
                        version: e.version + 1,
                        versionNonce: Math.floor(Math.random() * 2 ** 30),
                        updated: Date.now(),
                      },
                );
          current.current = [...next.values()].map((e) => ({ ...e }));
          fileData.current = files;
          publishDecks();
          if (readOnly) return;
          if (
            !pointerDown.current &&
            (captured.some((e, i) => fingerprint(e) !== fingerprint(elements[i])) ||
              projectCanvas(captured).some((e, i) => e.isDeleted !== elements[i]?.isDeleted))
          )
            renderScene();
          const dirty = diff();
          if (!dirty.length) return;
          onSave(navigator.onLine ? 'saving' : 'offline');
          void persist();
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), 450);
        }}
        onScrollChange={(scrollX, scrollY, zoom) =>
          setView((v) => ({ ...v, scrollX, scrollY, zoom: zoom.value }))
        }
        onPointerUpdate={(payload) =>
          socketRef.current?.emit('cursor', { x: payload.pointer.x, y: payload.pointer.y })
        }
      >
        <MainMenu>
          {!readOnly && <MainMenu.DefaultItems.LoadScene />}
          <MainMenu.DefaultItems.SearchMenu />
          {!readOnly && <MainMenu.DefaultItems.ClearCanvas />}
          <MainMenu.DefaultItems.Help />
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo>
              <span className="canvas-welcome-logo">
                основа<span>.</span>
              </span>
            </WelcomeScreen.Center.Logo>
            <WelcomeScreen.Center.Heading>
              Каждый урок — новое открытие
            </WelcomeScreen.Center.Heading>
            <div className="canvas-welcome-text">
              Начните с текста, рисунка или загрузите рабочий лист.
              <br />
              Всё сохранится в вашем пространстве.
            </div>
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </Excalidraw>
      <div className="presentation-overlay">
        {decks.map((deck) => {
          const p = presentationOf(deck)!,
            x = (deck.x + view.scrollX) * view.zoom,
            y = (deck.y + view.scrollY) * view.zoom,
            w = deck.width * view.zoom,
            h = deck.height * view.zoom;
          if (x + w < 0 || y + h < 50 || x > view.width || y > view.height || w < 40) return null;
          const width = Math.min(Math.max(w, 270), 480);
          return (
            <div
              className="presentation-controls"
              key={deck.id}
              data-presentation-id={deck.id}
              data-slide-index={p.slideIndex}
              style={{
                left: Math.max(8, Math.min(x + (w - width) / 2, view.width - width - 8)),
                top: Math.min(y + h + 8, view.height - 72),
                width: Math.min(width, view.width - 16),
              }}
            >
              <div className="presentation-title">
                <FileText size={14} />
                <strong title={p.title}>{p.title}</strong>
                <button
                  className="icon-btn"
                  aria-label={`Показать крупно: ${p.title}`}
                  onClick={() =>
                    editor?.scrollToContent([deck], {
                      fitToContent: true,
                      viewportZoomFactor: 0.75,
                    })
                  }
                >
                  <Maximize2 size={15} />
                </button>
              </div>
              <div className="presentation-navigation">
                <button
                  className="icon-btn"
                  aria-label={`Предыдущий слайд: ${p.title}`}
                  disabled={readOnly || !!switching || p.slideIndex === 0}
                  onClick={() => changeSlide(deck.id, p.slideIndex - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <label>
                  <span className="sr-only">Слайд презентации {p.title}</span>
                  <select
                    value={p.slideIndex}
                    disabled={readOnly || !!switching}
                    onChange={(e) => changeSlide(deck.id, Number(e.target.value))}
                  >
                    {p.slides.map((_, i) => (
                      <option key={i} value={i}>
                        Слайд {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="slide-counter">
                  {p.slideIndex + 1} / {p.slides.length}
                </span>
                <button
                  className="icon-btn"
                  aria-label={`Следующий слайд: ${p.title}`}
                  disabled={readOnly || !!switching || p.slideIndex === p.slides.length - 1}
                  onClick={() => changeSlide(deck.id, p.slideIndex + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function BoardInvites({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const { toast } = useApp();
  const [form, setForm] = useState({ permission: 'edit', hours: 24, maxUses: 4 }),
    [url, setUrl] = useState(''),
    [list, setList] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const reload = async () => {
    setList(await api(`/boards/${boardId}/invites`));
    setMembers(await api(`/boards/${boardId}/members`));
  };
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [boardId]);
  if (url)
    return (
      <InviteDialog
        url={url}
        title="Ссылка на доску"
        onClose={() => {
          setUrl('');
          void reload();
        }}
      />
    );
  return (
    <Modal title="Пригласить на доску" onClose={onClose}>
      <p className="muted">
        Ссылка открывает доступ только к этой доске. Её можно отозвать в любое время.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await api(`/boards/${boardId}/invites`, form);
            setUrl(result.url);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Разрешения">
          <select
            value={form.permission}
            onChange={(e) => setForm({ ...form, permission: e.target.value })}
          >
            <option value="edit">Может редактировать</option>
            <option value="view">Только просмотр</option>
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Срок ссылки">
            <select
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
            >
              <option value={1}>1 час</option>
              <option value={24}>24 часа</option>
              <option value={168}>7 дней</option>
            </select>
          </Field>
          <Field label="Количество входов">
            <input
              type="number"
              min={1}
              max={20}
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })}
            />
          </Field>
        </div>
        <FormError error={error} />
        <SaveButton busy={busy} label="Создать ссылку" />
      </form>
      <hr />
      <h3>Выданные ссылки</h3>
      {list.map((i) => (
        <div className="invite-row" key={i.id}>
          <div>
            <strong>{i.permission === 'edit' ? 'Редактирование' : 'Просмотр'}</strong>
            <small className="muted">
              До {date(i.expires_at, { hour: '2-digit', minute: '2-digit' })} · {i.uses}/
              {i.max_uses} входов
            </small>
          </div>
          {i.revoked ? (
            <Badge tone="gray">Отозвана</Badge>
          ) : (
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await api(`/invites/${i.id}`, undefined, 'DELETE');
                  await reload();
                  toast('Ссылка отозвана');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Отозвать
            </Button>
          )}
        </div>
      ))}
      <h3>Участники</h3>
      {members.map((m) => (
        <div className="invite-row" key={m.user_id}>
          <div>
            <strong>{m.name}</strong>
            <small className="muted">
              {m.permission === 'edit' ? 'Редактирование' : 'Просмотр'}
            </small>
          </div>
          <button
            className="icon-btn"
            aria-label={`Закрыть доступ ${m.name}`}
            onClick={async () => {
              try {
                await api(`/boards/${boardId}/members/${m.user_id}`, undefined, 'DELETE');
                await reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </Modal>
  );
}
function BoardHistory({
  pageId,
  revision,
  onClose,
}: {
  pageId: string;
  revision: () => number;
  onClose: () => void;
}) {
  const { toast } = useApp();
  const [list, setList] = useState<any[]>([]),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<any>(null);
  useEffect(() => {
    api(`/pages/${pageId}/history`)
      .then(setList)
      .catch((e) => setError(e.message));
  }, [pageId]);
  if (selected)
    return (
      <Confirm
        title="Восстановить версию?"
        text="Текущий холст попадёт в историю. Участники увидят восстановленную версию."
        onClose={() => setSelected(null)}
        onConfirm={async () => {
          await api(`/pages/${pageId}/restore`, {
            snapshotId: selected.id,
            expectedRevision: revision(),
          });
          toast('Версия восстановлена');
          onClose();
        }}
      />
    );
  return (
    <Modal title="История холста" onClose={onClose}>
      <p className="muted">
        Последние 50 сохранённых версий. Восстановление доступно преподавателю.
      </p>
      <FormError error={error} />
      {list.map((s) => (
        <button className="history-row" key={s.id} onClick={() => setSelected(s)}>
          <History size={17} />
          <div>
            <strong>Версия {s.revision}</strong>
            <small>
              {date(s.created_at, { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ·{' '}
              {s.author}
            </small>
          </div>
          <ArrowRight size={17} />
        </button>
      ))}
      {!list.length && <Empty title="История начнётся с первого изменения" />}
    </Modal>
  );
}
