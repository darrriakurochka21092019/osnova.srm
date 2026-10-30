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
  viewportCoordsToSceneCoords,
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
import { api, date, fileUrl, upload, dataUrlBlob } from '../api';
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
import {
  readDraft,
  writeDraft,
  pruneDraftFiles,
  repairOfflineDraft,
  type OfflineDraft,
} from '../board/offline';
import type {
  Asset,
  Board,
  BoardBackground,
  PresentationSlide,
  Page,
} from '../../../../packages/contracts';

import { backgrounds, backgroundStyle, paintBackground } from '../board/background';
import { captureCanvas, snapshotCanvas, repairCanvasGeometry } from '../board/canvas';
import { decorateLine, figureFromDrag, badgeParts } from '../board/geometry';
import {
  canvasHit,
  objectSelection,
  duplicateObjects,
  movableHit,
  movingObjectIds,
  translateObjects,
} from '../board/interaction';
import { figures, type FigureKind, type FigureSpec, type LineKind } from '../board/catalog';
import BoardTools, { VectorPreview } from '../board/BoardTools';
import '../board/tools.css';
import '../board/fonts.css';
import {
  defaultText,
  textModel,
  renderText,
  wrapText,
  editingProjection,
  unmaskText,
  type TextModel,
} from '../board/richText';
import BoardExportDialog from '../board/BoardExportDialog';
import {
  defaultExport,
  pdfLayout,
  type BoardExportOptions,
  type ExportComment,
} from '../board/exportLayout';
import RichTextEditor, { type TextEditing } from '../board/RichTextEditor';
import { inkScale, penSizes, markerSizes, pictureStickers } from '../board/catalog';
import {
  presentationOf,
  projectCanvas,
  slideIsHidden,
  changedElement,
} from '../../../../packages/contracts/canvas';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
(window as any).EXCALIDRAW_ASSET_PATH = `${window.location.origin}/excalidraw-assets/`;

export type SaveState = 'saved' | 'saving' | 'offline' | 'error';
export type BoardSelection = {
  ids: string[];
  count: number;
  textCount: number;
  locked: boolean;
  label: string;
  fontFamily?: number;
  fontSize?: number;
  width?: number;
  color?: string;
  fill?: string;
  text?: string;
  figure?: FigureSpec;
  type?: string;
  isNote?: boolean;
  inkTool?: 'pen' | 'marker';
  bounds?: {
    inspectorX: number;
    lockX: number;
    lockY: number;
  };
};
export type BoardToolState = {
  type: string;
  color: string;
  width: number;
  zoom: number;
  readOnly: boolean;
  fontFamily?: number;
  fontSize?: number;
  lineKind?: LineKind;
  figureKind?: FigureKind;
  selection?: BoardSelection;
  opacity?: number;
  fill?: string;
  textStyle?: TextModel;
  inspectorOpen?: boolean;
  interacting?: boolean;
  editingText?: boolean;
};
export type BoardPresentation = {
  id: string;
  title: string;
  slideIndex: number;
  slides: { fileId: string; src?: string }[];
};
export type BoardControls = {
  upload: () => void;
  export: () => void;
  history: () => void;
  background: () => void;
  isBusy: () => boolean;
};
export type EditorHandle = {
  flush: () => Promise<void>;
  export: (type: 'png' | 'pdf' | 'scene', options?: BoardExportOptions) => Promise<void>;
  previewExport: (options: BoardExportOptions) => Promise<string>;
  addMedia: (elements: any[], files: any[]) => void;
  placement: () => { x: number; y: number };
  addTemplate: (kind: string) => void;
  setPen: (highlight: boolean) => void;
  revision: () => number;
  isSaved: () => boolean;
  setTool: (type: string) => void;
  setColor: (color: string) => void;
  setWidth: (width: number) => void;
  setOpacity: (opacity: number) => void;
  setTextStyle: (style: {
    fontFamily?: string | number;
    fontSize?: number;
    text?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    textAlign?: 'left' | 'center' | 'right';
  }) => Promise<void>;
  editText: () => void;
  objectAction: (action: 'duplicate' | 'front' | 'back' | 'delete') => void;
  setFill: (color: string) => void;
  setLineKind: (kind: LineKind) => void;
  setFigureKind: (kind: FigureKind) => void;
  ungroup: () => void;
  addSticker: (kind: string, color: string, text?: string) => void;
  addPictureSticker: (id: string) => Promise<void>;
  addFormula: (text: string, title?: string) => void;
  showInspector: (show: boolean) => void;
  lockSelection: () => void;
  selectObject: (id: string) => void;
  undo: (redo?: boolean) => void;
  zoomBy: (amount: number) => void;
  fit: () => void;
  slide: (id: string, index: number) => Promise<void>;
  preview: (scene: any[] | null, background?: BoardBackground) => Promise<void>;
};
type BoardRoomProps = {
  boardId?: string;
  embedded?: boolean;
  editorRef?: React.MutableRefObject<EditorHandle | null>;
  controlsRef?: React.MutableRefObject<BoardControls | null>;
  onSaveState?: (state: SaveState, error?: string) => void;
  onTools?: (state: BoardToolState) => void;
  onPresentations?: (presentations: BoardPresentation[]) => void;
  onReady?: () => void;
  forceReadOnly?: boolean;
  exportComments?: ExportComment[];
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

export default function BoardRoom(props: BoardRoomProps = {}) {
  const { id: routeId } = useParams(),
    id = props.boardId || routeId,
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
    [help, setHelp] = useState(false),
    [editorReady, setEditorReady] = useState(false),
    [peers, setPeers] = useState<{ id: string; name: string }[]>([]),
    [toolsOpen, setToolsOpen] = useState(false),
    [toolState, setToolState] = useState<BoardToolState>({
      type: 'selection',
      color: '#252846',
      width: 2,
      zoom: 1,
      readOnly: false,
    }),
    [conflict, setConflict] = useState<{ elements: any[]; files: any } | null>(null);
  const internalHandle = useRef<EditorHandle | null>(null),
    handle = props.editorRef || internalHandle,
    fileInput = useRef<HTMLInputElement>(null),
    importing = useRef(false);
  useEffect(() => {
    props.onSaveState?.(backgroundBusy ? 'saving' : save, saveError);
  }, [save, saveError, backgroundBusy]);
  useEffect(() => {
    if (!props.controlsRef) return;
    props.controlsRef.current = {
      upload: () => fileInput.current?.click(),
      export: () => setExportOpen(true),
      history: () => setHistoryOpen(true),
      background: () => setBackgroundOpen((v) => !v),
      isBusy: () => importing.current,
    };
    return () => {
      if (props.controlsRef) props.controlsRef.current = null;
    };
  }, [id, props.controlsRef]);
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
  const readOnly = props.forceReadOnly || board?.permission === 'view' || !!board?.archived;
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
    const remaining = new URLSearchParams(search);
    remaining.delete('import');
    setSearch(remaining, { replace: true });
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
    <div className={`board-room ${props.embedded ? 'lesson-embedded' : ''}`}>
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
          {user.role === 'teacher' && (
            <button className="board-action" onClick={() => setHistoryOpen(true)}>
              <History size={16} />
              История
            </button>
          )}
          <button className="board-action" onClick={() => setToolsOpen((v) => !v)}>
            Настройки инструментов
          </button>
          <span className="board-participant-count">{peers.length + 1} на доске</span>
        </div>
      </div>
      {!props.embedded && (
        <div className={`legacy-board-tools ${toolsOpen ? '' : 'tools-collapsed'}`}>
          <BoardTools
            editor={handle}
            tool={toolState}
            ready={editorReady}
            upload={() => fileInput.current?.click()}
          />
        </div>
      )}
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
            onReady={() => {
              setEditorReady(true);
              props.onReady?.();
            }}
            onBackground={(background) => setBoard((b) => (b ? { ...b, background } : b))}
            onTools={props.onTools || setToolState}
            onPresentations={props.onPresentations}
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
          editor={handle}
          embedded={props.embedded}
        />
      )}
      {exportOpen && (
        <BoardExportDialog
          editor={handle}
          comments={props.exportComments}
          onClose={() => setExportOpen(false)}
        />
      )}
      {help && (
        <Modal title="Общий холст для любого предмета" onClose={() => setHelp(false)}>
          <p>
            На бесконечном холсте можно размещать тексты, изображения, схемы и несколько
            PDF-презентаций. Перемещайте объекты и меняйте их размер инструментом выделения.
          </p>
          <p>
            Выделите презентацию: кнопки переключения слайдов появятся прямо под ней. Пометки внутри
            слайда сохраняются отдельно для него и возвращаются при переходе назад. Изменение слайда
            видно всем участникам с доступом к доске.
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

type SurfaceGesture =
  | {
      kind: 'pan';
      id: number;
      x: number;
      y: number;
      scrollX: number;
      scrollY: number;
      zoom: number;
    }
  | {
      kind: 'figure';
      id: number;
      figure: FigureKind;
      start: [number, number];
      end: [number, number];
      constrain: boolean;
      color: string;
      width: number;
      fill: string;
    }
  | {
      kind: 'object';
      id: number;
      start: [number, number];
      ids: Set<string>;
      elements: readonly any[];
      moved: boolean;
      dx: number;
      dy: number;
      locked: boolean;
    }
  | { kind: 'locked' | 'text'; id: number };

function PageEditor({
  board,
  pageId,
  readOnly,
  handleRef,
  onSave: updateSaveState,
  onPeers,
  onConflict,
  onPages,
  onReady,
  onBackground,
  onTools,
  onPresentations,
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
  onTools?: (state: BoardToolState) => void;
  onPresentations?: (presentations: BoardPresentation[]) => void;
}) {
  const { user, toast } = useApp();
  const [initial, setInitial] = useState<any>(null),
    [error, setError] = useState(''),
    [editor, setEditor] = useState<ExcalidrawImperativeAPI | null>(null),
    [view, setView] = useState({ scrollX: 0, scrollY: 0, zoom: 1, width: 0, height: 0 }),
    [decks, setDecks] = useState<any[]>([]),
    [switching, setSwitching] = useState(''),
    [previewing, setPreviewing] = useState(false),
    [previewBackground, setPreviewBackground] = useState<BoardBackground | null>(null),
    [selectedDeck, setSelectedDeck] = useState(''),
    [activeFigure, setActiveFigure] = useState<FigureKind | null>(null),
    [drawing, setDrawing] = useState<{ parts: any[]; color: string; width: number } | null>(null),
    [panning, setPanning] = useState(false),
    [textEditing, setTextEditing] = useState<TextEditing | null>(null);
  const surface = useRef<HTMLDivElement>(null),
    surfaceGesture = useRef<SurfaceGesture | null>(null),
    figureKind = useRef<FigureKind | null>(null),
    textTool = useRef(false),
    editingRef = useRef<TextEditing | null>(null),
    recoveredText = useRef<TextEditing | undefined>(undefined),
    textTasks = useRef(new Set<Promise<void>>()),
    textEpoch = useRef(new Map<string, number>()),
    textDrafts = useRef(new Map<string, TextModel>()),
    textAutosave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    inkTool = useRef<'pen' | 'marker'>('pen'),
    inspectorOpen = useRef(false),
    objectInteracting = useRef(false),
    lastObjectClick = useRef<{ key: string; at: number; x: number; y: number } | null>(null),
    nativeStart = useRef<{ x: number; y: number; clicked: boolean } | null>(null);
  const deckStamp = useRef('');
  const selectionRef = useRef<BoardSelection>({
      ids: [],
      count: 0,
      textCount: 0,
      locked: false,
      label: '',
    }),
    retainedSelection = useRef<string[]>([]),
    selectedDeckRef = useRef(''),
    lineKind = useRef<LineKind>('single'),
    inkProfiles = useRef({
      pen: { color: '#11162e', width: penSizes.initial, opacity: 100 },
      marker: { color: '#ffe94d', width: markerSizes.initial, opacity: 35 },
    });
  const publishSelection = (
    elements: readonly any[],
    state: ReturnType<ExcalidrawImperativeAPI['getAppState']>,
  ) => {
    const ids = Object.keys(state.selectedElementIds).filter((id) => state.selectedElementIds[id]);
    const expanded = new Set(ids.length ? ids : retainedSelection.current);
    for (const e of elements)
      if (expanded.has(e.id))
        for (const bound of e.boundElements || [])
          if (bound.type === 'text') expanded.add(bound.id);
    for (const e of elements)
      if (expanded.has(e.id)) {
        for (const id of objectSelection(elements, e.id)) expanded.add(id);
      }
    const chosen = elements.filter((e) => !e.isDeleted && expanded.has(e.id));
    const text = chosen.find((e) => textModel(e)),
      first = chosen.find((e) => e.type !== 'text' && !e.customData?.richText) || chosen[0];
    const m = editingRef.current?.model || (text && textModel(text));
    const figure = chosen.find((e) => e.customData?.boardFigure)?.customData?.boardFigure?.spec;
    const [x, y, right, bottom] = chosen.length
      ? getCommonBounds(chosen)
      : editingRef.current
        ? [
            editingRef.current.x,
            editingRef.current.y,
            editingRef.current.x + (m?.maxWidth || 400),
            editingRef.current.y + (m?.fontSize || 24) * 1.5,
          ]
        : [0, 0, 0, 0];
    const host =
      surface.current?.closest('.lesson-board-area') || surface.current?.closest('.board-room');
    const rect = host?.getBoundingClientRect();
    const ox = state.offsetLeft - (rect?.left || state.offsetLeft),
      oy = state.offsetTop - (rect?.top || state.offsetTop);
    const vx = ox + (x + state.scrollX) * state.zoom.value,
      vy = oy + (y + state.scrollY) * state.zoom.value;
    const vr = ox + (right + state.scrollX) * state.zoom.value;
    selectionRef.current = {
      ids: editingRef.current ? [editingRef.current.id] : chosen.map((e) => e.id),
      count: editingRef.current ? 1 : chosen.length,
      textCount: editingRef.current ? 1 : chosen.filter((e) => textModel(e)).length,
      locked: !!chosen.length && chosen.every((e) => e.locked),
      label: (m?.text || 'Объект').slice(0, 80),
      color:
        m?.color ||
        (first?.strokeColor === 'transparent' ? state.currentItemStrokeColor : first?.strokeColor),
      width: first?.type === 'freedraw' ? first.strokeWidth * inkScale : first?.strokeWidth,
      fill: first?.backgroundColor,
      fontFamily: text?.fontFamily,
      fontSize: m?.fontSize,
      ...(m ? { text: m.text } : {}),
      figure,
      type: first?.type,
      isNote: chosen.some((e) => e.customData?.sticker?.kind === 'note'),
      inkTool: first?.customData?.inkTool,
      bounds: {
        inspectorX: state.width > 760 && (vx + vr) / 2 < 340 && vy < 380 ? state.width - 230 : 104,
        lockX: Math.max(
          72,
          Math.min(presentationOf(first || {}) ? vr + 8 : (vx + vr) / 2 - 16, state.width - 40),
        ),
        lockY: Math.max(
          8,
          Math.min(
            presentationOf(first || {})
              ? vy - 38
              : oy + (bottom + state.scrollY) * state.zoom.value + 14,
            state.height - 42,
          ),
        ),
      },
    };
    const deck = chosen.length === 1 && presentationOf(chosen[0]) ? chosen[0].id : '';
    if (!readOnly && !previewScene.current && deck !== selectedDeckRef.current) {
      selectedDeckRef.current = deck;
      setSelectedDeck(deck);
    }
  };
  const previewScene = useRef<any[] | null>(null),
    assetUrls = useRef(new Map<string, string>()),
    toolStamp = useRef('');
  const pointerDown = useRef(false),
    dragStart = useRef<any[] | null>(null),
    gestureEpoch = useRef(0),
    gestureWaiters = useRef<(() => void)[]>([]),
    remoteQueue = useRef<any[]>([]),
    deferredRender = useRef(false),
    nativeScene = useRef<{ elements: readonly any[]; version: number } | null>(null),
    viewRef = useRef(view),
    saveStamp = useRef(''),
    persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    persistTask = useRef<Promise<void> | null>(null),
    persistAgain = useRef(false),
    cursor = useRef<{
      at: number;
      point: { x: number; y: number } | null;
      timer?: ReturnType<typeof setTimeout>;
    }>({ at: 0, point: null });
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
  const onSave = (state: SaveState, error?: string) => {
    const stamp = `${state}:${error || ''}`;
    if (stamp === saveStamp.current) return;
    saveStamp.current = stamp;
    updateSaveState(state, error);
  };
  const updateView = (next: typeof view) => {
    const before = viewRef.current;
    if (
      Object.keys(next).every(
        (key) => next[key as keyof typeof next] === before[key as keyof typeof next],
      )
    )
      return;
    viewRef.current = next;
    setView(next);
  };
  const waitForGestureEnd = () =>
    pointerDown.current
      ? new Promise<void>((resolve) => gestureWaiters.current.push(resolve))
      : Promise.resolve();
  const releaseGestureWaiters = () => {
    for (const resolve of gestureWaiters.current.splice(0)) resolve();
  };
  const sendCursor = (point: { x: number; y: number }) => {
    cursor.current.point = point;
    if (cursor.current.timer) return;
    const send = () => {
      cursor.current.timer = undefined;
      cursor.current.at = performance.now();
      if (socketRef.current?.connected && cursor.current.point)
        socketRef.current.volatile.emit('cursor', cursor.current.point);
    };
    const delay = Math.max(0, 50 - (performance.now() - cursor.current.at));
    if (delay) cursor.current.timer = setTimeout(send, delay);
    else send();
  };
  const publishDecks = () => {
    const next = (previewScene.current || current.current).filter(
      (e) => !e.isDeleted && presentationOf(e),
    );
    const stamp = next.map((e) => `${e.id}:${fingerprint(e)}`).join('|');
    if (deckStamp.current !== stamp) {
      deckStamp.current = stamp;
      setDecks(next);
      onPresentations?.(
        next.map((e) => {
          const p = presentationOf(e)!;
          return {
            id: e.id,
            title: p.title,
            slideIndex: p.slideIndex,
            slides: p.slides.map((s) => ({
              fileId: s.fileId,
              src:
                assetUrls.current.get(s.fileId) ||
                fileData.current[s.fileId as keyof BinaryFiles]?.dataURL,
            })),
          };
        }),
      );
    }
  };
  const renderScene = (
    captureUpdate: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction] = CaptureUpdateAction.NEVER,
  ) => {
    if (previewScene.current) return;
    if (pointerDown.current) {
      deferredRender.current = true;
      return;
    }
    deferredRender.current = false;
    const native = new Map(editor?.getSceneElementsIncludingDeleted().map((e) => [e.id, e]));
    editor?.updateScene({
      // Keep native references for unchanged objects so autosave/remote edits cannot interrupt a stroke.
      elements: restoreElements(
        editingProjection(projectCanvas(current.current), editingRef.current?.id),
        null,
      ).map((e) => {
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
  const editingDirty = () => {
    const value = editingRef.current;
    if (!value) return false;
    const present = editor?.getSceneElements().find((e) => e.id === value.id);
    if (!present && !value.model.text.trim() && !value.model.containerId) return false;
    return JSON.stringify(present?.customData?.richText) !== JSON.stringify(value.model);
  };
  const commitText = (value: TextEditing, select = true): Promise<void> => {
    if (!editor || readOnly || previewScene.current) return Promise.resolve();
    const present = editor.getSceneElements().find((e) => e.id === value.id);
    if (!value.model.text.trim() && !value.model.containerId) {
      if (present && !present.locked) {
        textEpoch.current.set(value.id, (textEpoch.current.get(value.id) || 0) + 1);
        editor.updateScene({
          elements: editor
            .getSceneElementsIncludingDeleted()
            .map((e) => (e.id === value.id ? changedElement(e, { isDeleted: true }) : e)),
          appState: { selectedElementIds: {} },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      }
      return Promise.resolve();
    }
    if (present?.locked) return Promise.resolve();
    if (present && JSON.stringify(textModel(present)) === JSON.stringify(value.model)) {
      if (
        select &&
        (!editingRef.current || editingRef.current.id === value.id) &&
        (!selectionRef.current.ids.length || selectionRef.current.ids.includes(value.id))
      ) {
        const ids = objectSelection(editor.getSceneElements(), value.id);
        editor.updateScene({
          appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
      return Promise.resolve();
    }
    const epoch = (textEpoch.current.get(value.id) || 0) + 1;
    textEpoch.current.set(value.id, epoch);
    const task = (async () => {
      const rendered = await renderText(value.model);
      await waitForGestureEnd();
      if (!mounted.current || !ready.current || textEpoch.current.get(value.id) !== epoch) return;
      const old = unmaskText(editor.getSceneElementsIncludingDeleted()).find(
        (e) => e.id === value.id,
      );
      if (old?.isDeleted || old?.locked) return;
      const parent = value.model.containerId
        ? editor.getSceneElements().find((e) => e.id === value.model.containerId)
        : undefined;
      const groupIds = parent
        ? parent.groupIds.length
          ? [...parent.groupIds]
          : [crypto.randomUUID()]
        : old?.groupIds || value.groupIds || [];
      const fileId = crypto.randomUUID(),
        file = {
          id: fileId,
          dataURL: rendered.dataURL,
          mimeType: 'image/png',
          created: Date.now(),
        } as any;
      fileData.current = { ...fileData.current, [fileId]: file };
      editor.addFiles([file]);
      const image = convertToExcalidrawElements(
        [
          {
            type: 'image',
            id: value.id,
            fileId,
            status: 'saved',
            x: old?.x ?? value.x,
            y: old?.y ?? value.y,
            width: rendered.width,
            height: rendered.height,
            angle: old?.angle ?? value.angle,
            groupIds,
            strokeColor: rendered.model.color,
            opacity: old?.opacity ?? 100,
            customData: {
              ...old?.customData,
              ...value.customData,
              richText: rendered.model,
              richTextSize: { width: rendered.width, height: rendered.height },
              ...(parent ? { stickerAnnotation: { stickerId: parent.id } } : {}),
            },
          },
        ] as any,
        { regenerateIds: false },
      )[0];
      const next = old ? changedElement(old, { ...image, index: old.index }) : image;
      for (const key of [
        'text',
        'originalText',
        'fontFamily',
        'fontSize',
        'lineHeight',
        'containerId',
        'autoResize',
        'textAlign',
        'verticalAlign',
      ])
        delete (next as any)[key];
      const all = unmaskText(editor.getSceneElementsIncludingDeleted()).map((e) =>
        e.id === next.id
          ? next
          : parent && e.id === parent.id
            ? changedElement(e, {
                groupIds,
                boundElements: e.boundElements?.filter((b: any) => b.id !== next.id) || null,
              })
            : e,
      );
      if (!old) all.push(next);
      editor.updateScene({
        elements: editingProjection(all, editingRef.current?.id),
        ...(select &&
        (!editingRef.current || editingRef.current.id === value.id) &&
        editor.getAppState().activeTool.type !== 'freedraw' &&
        (!selectionRef.current.ids.length ||
          selectionRef.current.ids.includes(value.id) ||
          selectionRef.current.ids.includes(value.model.containerId || '') ||
          value.customData?.formula)
          ? {
              appState: {
                selectedElementIds: { [next.id]: true, ...(parent ? { [parent.id]: true } : {}) },
              },
            }
          : {}),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      textDrafts.current.delete(value.id);
    })();
    textTasks.current.add(task);
    task.then(
      () => textTasks.current.delete(task),
      () => textTasks.current.delete(task),
    );
    return task;
  };
  const editText = (value: TextEditing | null) => {
    const previous = editingRef.current?.id;
    editingRef.current = value;
    setTextEditing(value);
    inspectorOpen.current = false;
    if (editor && previous !== value?.id)
      editor.updateScene({
        elements: editingProjection(
          unmaskText(editor.getSceneElementsIncludingDeleted()),
          value?.id,
        ),
        ...(value ? { appState: { selectedElementIds: {} } } : {}),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    if (value) {
      onSave('saving');
      clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        persistTimer.current = undefined;
        void persist();
      }, 120);
      clearTimeout(textAutosave.current);
      textAutosave.current = setTimeout(() => {
        if (editingRef.current)
          void commitText(editingRef.current, false).catch((e) => onSave('error', e.message));
      }, 600);
    }
    if (editor) reportTools(editor.getSceneElementsIncludingDeleted(), editor.getAppState());
  };
  const closeText = () => {
    clearTimeout(textAutosave.current);
    const value = editingRef.current;
    editText(null);
    textTool.current = false;
    editor?.setActiveTool({ type: 'selection' });
    if (value)
      void commitText(value)
        .then(() => {
          if (!diff().length && !pendingOperation.current && !textTasks.current.size)
            onSave('saved');
          void persist();
        })
        .catch((e) => onSave('error', e.message));
  };
  const beginTextEditing = (element: any) => {
    if (!element || element.locked || readOnly || previewScene.current) return;
    const target = textModel(element)
      ? element
      : editor
          ?.getSceneElements()
          .find(
            (e) =>
              e.customData?.richText?.containerId === element.id ||
              (e.type === 'text' && e.containerId === element.id),
          );
    const model = target && textModel(target);
    if (!model || !target || target.locked) return;
    textTool.current = false;
    editor?.setActiveTool({ type: 'selection' });
    editText({
      id: target.id,
      x: target.x,
      y: target.y,
      angle: target.angle,
      model,
      groupIds: [...target.groupIds],
    });
  };
  const persist = (): Promise<void> => {
    if (readOnly) return Promise.resolve();
    if (persistTask.current) {
      persistAgain.current = true;
      return persistTask.current;
    }
    persistTask.current = (async () => {
      do {
        persistAgain.current = false;
        await waitForGestureEnd();
        await writeDraft(
          key,
          diff().length || pendingOperation.current || editingDirty()
            ? {
                elements: current.current,
                base: [...base.current.values()],
                files: fileData.current,
                pending: pendingOperation.current,
                ...(editingRef.current ? { richTextDraft: editingRef.current } : {}),
              }
            : null,
        );
        storageOkay.current = true;
        if (mounted.current && !navigator.onLine && diff().length) onSave('offline');
      } while (persistAgain.current);
    })()
      .catch((error) => {
        storageOkay.current = false;
        onSave(
          'error',
          error?.message?.includes('вкладки')
            ? error.message
            : 'Браузер не смог сохранить локальную очередь. Не закрывайте страницу до подтверждения сервера.',
        );
      })
      .finally(() => {
        persistTask.current = null;
      });
    return persistTask.current;
  };
  const queueSave = () => {
    if (readOnly || !diff().length) return;
    onSave('saving');
    if (!persistTimer.current)
      persistTimer.current = setTimeout(() => {
        persistTimer.current = undefined;
        void persist();
      }, 120);
    if (!timer.current)
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void flush();
      }, 400);
  };
  const reportTools = (
    elements: readonly any[],
    state: ReturnType<ExcalidrawImperativeAPI['getAppState']>,
  ) => {
    if (pointerDown.current) return;
    if (figureKind.current && state.activeTool.type !== 'custom') {
      figureKind.current = null;
      setActiveFigure(null);
    }
    publishSelection(elements, state);
    const nextTool: BoardToolState = {
      type:
        editingRef.current || textTool.current
          ? 'text'
          : figureKind.current
            ? 'figure'
            : state.activeTool.type === 'freedraw'
              ? inkTool.current
              : state.activeTool.type,
      color: state.currentItemStrokeColor,
      width: selectionRef.current.count
        ? selectionRef.current.width || state.currentItemStrokeWidth
        : state.activeTool.type === 'freedraw'
          ? state.currentItemStrokeWidth * inkScale
          : state.currentItemStrokeWidth,
      zoom: state.zoom.value,
      readOnly: readOnly || !!previewScene.current,
      fontFamily: selectionRef.current.fontFamily || state.currentItemFontFamily,
      fontSize: selectionRef.current.fontSize || state.currentItemFontSize,
      lineKind: lineKind.current,
      figureKind: figureKind.current || undefined,
      selection: selectionRef.current,
      opacity:
        elements.find((e) => selectionRef.current.ids.includes(e.id))?.opacity ??
        state.currentItemOpacity,
      fill: state.currentItemBackgroundColor,
      inspectorOpen: inspectorOpen.current,
      interacting: objectInteracting.current,
      editingText: !!editingRef.current,
      textStyle:
        editingRef.current?.model ||
        textModel(
          elements.find((e) => selectionRef.current.ids.includes(e.id) && textModel(e)) || {},
        ),
    };
    const stamp = JSON.stringify(nextTool);
    if (stamp !== toolStamp.current) {
      toolStamp.current = stamp;
      onTools?.(nextTool);
    }
  };
  const captureRendered = (elements: readonly any[], before = current.current) => {
    nativeScene.current = { elements, version: elements.reduce((n, e) => n + e.version, 0) };
    const oldIds = new Set(before.map((e) => e.id));
    const decorated = repairCanvasGeometry(unmaskText(elements), before).flatMap((e) =>
      dragStart.current &&
      e.type === 'line' &&
      !e.isDeleted &&
      !oldIds.has(e.id) &&
      !e.customData?.boardLine &&
      !e.customData?.boardFigure
        ? convertToExcalidrawElements(decorateLine(e, lineKind.current, `${e.id}-line`) as any, {
            regenerateIds: false,
          })
        : [e],
    );
    const tagged = decorated.map((e) =>
      e.type === 'freedraw' && !e.isDeleted && !oldIds.has(e.id) && !e.customData?.inkTool
        ? changedElement(e, { customData: { ...e.customData, inkTool: inkTool.current } })
        : e,
    );
    const captured = captureCanvas(tagged, before);
    const next = new Map(captured.map((e) => [e.id, e]));
    const index = new Map(before.map((e) => [e.id, e]));
    for (const e of base.current.values())
      if (!next.has(e.id))
        next.set(
          e.id,
          slideIsHidden(e, before, index) ? e : changedElement(e, { isDeleted: true }),
        );
    current.current = snapshotCanvas([...next.values()], current.current);
    publishDecks();
    const projected = editingProjection(projectCanvas(current.current), editingRef.current?.id);
    if (
      projected.length !== elements.length ||
      projected.some(
        (e, i) =>
          fingerprint(e) !== fingerprint(elements[i]) || e.isDeleted !== elements[i]?.isDeleted,
      )
    )
      renderScene();
    queueSave();
  };
  const loadFiles = async (
    elements: any[],
    apiEditor?: ExcalidrawImperativeAPI,
    catalogOnly = false,
  ) => {
    const needed = new Set(
      elements
        .filter(
          (e) =>
            e.type === 'image' &&
            !e.isDeleted &&
            (!fileData.current[e.fileId as keyof BinaryFiles] || !knownFiles.current.has(e.fileId)),
        )
        .map((e) => e.fileId),
    );
    if (!needed.size && !catalogOnly) return;
    const assets = await api<Asset[]>(`/boards/${board.id}/files`);
    for (const f of assets)
      if (f.excalidraw_id) {
        knownFiles.current.add(f.excalidraw_id);
        assetUrls.current.set(f.excalidraw_id, fileUrl(f.id));
      }
    deckStamp.current = '';
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
          draft = repairOfflineDraft(draft);
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
          recoveredText.current = draft.richTextDraft;
        }
        if (!readOnly) scene = repairCanvasGeometry(scene);
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
      clearTimeout(persistTimer.current);
      pointerDown.current = false;
      gestureEpoch.current++;
      releaseGestureWaiters();
      handleRef.current = null;
      void persist()
        .then(() => pruneDraftFiles(key))
        .catch(() => {});
    };
  }, [pageId]);
  const applyRemote = async (payload: any) => {
    if (ownOperations.current.has(payload.operationId)) return;
    if (pointerDown.current) {
      remoteQueue.current.push(payload);
      return;
    }
    revision.current = Math.max(revision.current, payload.revision || 0);
    await loadFiles(payload.elements, editor || undefined);
    if (pointerDown.current) {
      remoteQueue.current.push(payload);
      return;
    }
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
    await waitForGestureEnd();
    if (!ready.current || running.current) return;
    if (editingRef.current) await commitText(editingRef.current, false);
    if (textTasks.current.size) await Promise.all([...textTasks.current]);
    clearTimeout(timer.current);
    timer.current = undefined;
    const repaired = repairOfflineDraft({
      elements: current.current,
      base: [...base.current.values()],
      files: fileData.current,
      pending: pendingOperation.current,
    });
    const geometryChanged = repaired.elements.some((e, i) => e !== current.current[i]);
    current.current = repaired.elements;
    pendingOperation.current = repaired.pending || null;
    if (geometryChanged) renderScene();
    const dirty = diff();
    if (!dirty.length && !pendingOperation.current) {
      onSave('saved');
      await persist();
      return;
    }
    if (!navigator.onLine) {
      await persist();
      if (storageOkay.current) onSave('offline');
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
            const blob = dataUrlBlob(f.dataURL);
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
      await waitForGestureEnd();
      if (!mounted.current) return;
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
      // A successful acknowledgement changes no visible objects. Only conflicts need reconciliation.
      if (result.conflicts.length) renderScene();
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
      if (recoveredText.current && !readOnly) {
        const value = recoveredText.current;
        recoveredText.current = undefined;
        editText(value);
        void commitText(value, false).catch((e) => onSave('error', e.message));
      }
      const visible = projectCanvas(current.current).filter((e) => !e.isDeleted);
      if (visible.length)
        editor.scrollToContent(restoreElements(visible, null), {
          fitToContent: true,
          viewportZoomFactor: 0.85,
        });
      void flush();
    };
    initialFrame = requestAnimationFrame(initialize);
    const stopPointerDown = editor.onPointerDown((tool, pointer) => {
      retainedSelection.current = [];
      inspectorOpen.current = false;
      if (readOnly || previewScene.current) {
        const scene = previewScene.current || current.current;
        const hit = [...scene]
          .reverse()
          .find(
            (e) =>
              !e.isDeleted &&
              presentationOf(e) &&
              pointer.origin.x >= e.x &&
              pointer.origin.x <= e.x + e.width &&
              pointer.origin.y >= e.y &&
              pointer.origin.y <= e.y + e.height,
          );
        selectedDeckRef.current = hit?.id || '';
        setSelectedDeck(hit?.id || '');
      }
      pointerDown.current = true;
      gestureEpoch.current++;
      if (!readOnly && tool.type === 'freedraw') onSave('saving');
      // Committed elements are immutable; there is no need to copy every prior stroke here.
      dragStart.current = current.current;
    });
    const stopPointerUp = editor.onPointerUp(() => {
      const epoch = gestureEpoch.current;
      // Excalidraw finalizes pressure/last point after emitting pointerup. A microtask runs
      // after that finalizer, before the next physical pen contact; a RAF can overlap it.
      queueMicrotask(() => {
        if (epoch !== gestureEpoch.current || !mounted.current) return;
        pointerDown.current = false;
        inspectorOpen.current =
          !!nativeStart.current?.clicked && editor.getAppState().activeTool.type === 'selection';
        nativeStart.current = null;
        if (!readOnly && ready.current && !previewScene.current)
          captureRendered(
            editor.getSceneElementsIncludingDeleted(),
            dragStart.current || current.current,
          );
        dragStart.current = null;
        reportTools(editor.getSceneElementsIncludingDeleted(), editor.getAppState());
        releaseGestureWaiters();
        if (deferredRender.current) renderScene();
        const queued = remoteQueue.current.splice(0);
        void (async () => {
          for (const payload of queued) await applyRemote(payload);
        })().catch((e) => onSave('error', e.message));
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
      pointerDown.current = false;
      gestureEpoch.current++;
      releaseGestureWaiters();
      onSave('error', 'Доступ к доске закрыт. Локальные изменения сохранены на устройстве.');
      editor.updateScene({ appState: { viewModeEnabled: true } });
    });
    const online = () => {
      void flush();
    };
    const close = (e: BeforeUnloadEvent) => {
      if (
        pointerDown.current ||
        diff().length ||
        pendingOperation.current ||
        textTasks.current.size ||
        editingDirty()
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', close);
    return () => {
      ready.current = false;
      cancelAnimationFrame(initialFrame);
      stopPointerDown();
      stopPointerUp();
      pointerDown.current = false;
      gestureEpoch.current++;
      releaseGestureWaiters();
      clearTimeout(cursor.current.timer);
      cursor.current.point = null;
      socketRef.current = null;
      socket.disconnect();
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', close);
    };
  }, [editor, !!initial]);
  const changeSlide = async (id: string, index: number) => {
    if ((readOnly && !previewScene.current) || switching) return;
    const source = previewScene.current || current.current;
    const deck = source.find((e) => e.id === id),
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
      if (previewScene.current) {
        // Browsing a saved lesson is local; its slide selection never changes the live board.
        previewScene.current = source.map((e) => (e.id === id ? next : e));
        editor?.updateScene({
          elements: restoreElements(projectCanvas(previewScene.current), null),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        publishDecks();
        return;
      }
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
  const renderExportCanvas = async (options: BoardExportOptions, preview = false) => {
    if (!editor) throw new Error('Доска загружается');
    await waitForGestureEnd();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const source =
      previewScene.current ||
      captureCanvas(editor.getSceneElementsIncludingDeleted(), current.current, {
        attachNew: false,
        transform: false,
      });
    let elements = projectCanvas(source).filter((e) => !e.isDeleted);
    if (!options.annotations)
      elements = elements.filter(
        (e) =>
          !e.customData?.sticker &&
          !e.customData?.stickerAnnotation &&
          !e.customData?.slideAnnotation &&
          !e.customData?.pictureSticker &&
          !e.containerId,
      );
    if (options.scope === 'selection') {
      const ids = new Set(selectionRef.current.ids);
      for (const id of [...ids]) for (const child of objectSelection(source, id)) ids.add(child);
      for (const e of elements)
        if (
          ids.has(e.customData?.stickerAnnotation?.stickerId) ||
          ids.has(e.customData?.slideAnnotation?.presentationId)
        )
          ids.add(e.id);
      elements = elements.filter((e) => ids.has(e.id));
    }
    const app = editor.getAppState();
    const area =
      options.scope === 'visible'
        ? {
            x: -app.scrollX,
            y: -app.scrollY,
            width: app.width / app.zoom.value,
            height: app.height / app.zoom.value,
          }
        : (() => {
            const b = elements.length ? getCommonBounds(elements) : [0, 0, 800, 500];
            return {
              x: b[0] - 24,
              y: b[1] - 24,
              width: Math.max(1, b[2] - b[0]) + 48,
              height: Math.max(1, b[3] - b[1]) + 48,
            };
          })();
    if (options.scope === 'visible')
      elements = elements.filter(
        (e) =>
          e.x + e.width >= area.x &&
          e.y + e.height >= area.y &&
          e.x <= area.x + area.width &&
          e.y <= area.y + area.height,
      );
    if (!elements.length && !options.comments?.length)
      throw new Error(
        options.scope === 'selection'
          ? 'Выделите объекты для экспорта'
          : 'В выбранной области пока нет объектов',
      );
    await loadFiles(elements, editor);
    const measure = document.createElement('canvas').getContext('2d')!;
    measure.font = '13px Onest, Arial';
    const commentWidth = Math.max(140, Math.min(900, area.width) - 32),
      comments = (options.comments || []).map((c) => ({
        name: c.name,
        lines: wrapText(c.body, (s) => measure.measureText(s).width, commentWidth),
      }));
    const commentHeight = comments.length
      ? 56 + comments.reduce((n, c) => n + 28 + c.lines.length * 19, 0)
      : 0;
    const targetHeight = area.height + commentHeight,
      scale = preview
        ? Math.min(380 / area.width, 200 / targetHeight)
        : Math.min(
            options.scale,
            12000 / Math.max(area.width, targetHeight),
            Math.sqrt(20_000_000 / (area.width * targetHeight)),
          );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(area.width * scale));
    canvas.height = Math.max(1, Math.ceil(targetHeight * scale));
    const ctx = canvas.getContext('2d')!;
    paintBackground(
      ctx,
      canvas.width,
      Math.ceil(area.height * scale),
      previewBackground || board.background || 'white',
      -area.x * scale,
      -area.y * scale,
      scale,
    );
    if (elements.length) {
      const bounds = getCommonBounds(elements),
        w = bounds[2] - bounds[0] + 48,
        h = bounds[3] - bounds[1] + 48,
        nativeScale = Math.min(scale, 12000 / Math.max(w, h), Math.sqrt(20_000_000 / (w * h)));
      const rendered = await exportToCanvas({
        elements,
        files: fileData.current,
        appState: { ...app, exportBackground: false, exportWithDarkMode: false },
        exportPadding: 24,
        getDimensions: (width: number, height: number) => ({
          width: Math.max(1, Math.ceil(width * nativeScale)),
          height: Math.max(1, Math.ceil(height * nativeScale)),
          scale: nativeScale,
        }),
      });
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, area.height * scale);
      ctx.clip();
      ctx.drawImage(
        rendered,
        (bounds[0] - 24 - area.x) * scale,
        (bounds[1] - 24 - area.y) * scale,
        w * scale,
        h * scale,
      );
      ctx.restore();
    }
    if (comments.length) {
      ctx.save();
      ctx.scale(scale, scale);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, area.height, area.width, commentHeight);
      ctx.fillStyle = '#11162e';
      ctx.font = '700 16px Onest, Arial';
      let y = area.height + 30;
      ctx.fillText('Комментарии к занятию', 16, y);
      y += 26;
      for (const c of comments) {
        ctx.font = '700 12px Onest, Arial';
        ctx.fillText(c.name, 16, y);
        y += 20;
        ctx.font = '13px Onest, Arial';
        for (const line of c.lines) {
          ctx.fillText(line, 16, y);
          y += 19;
        }
        y += 8;
      }
      ctx.restore();
    }
    return canvas;
  };
  useEffect(() => {
    if (!editor) return;
    const add = (skeletons: any[], select = false) => {
      if (readOnly || previewScene.current) return [];
      figureKind.current = null;
      textTool.current = false;
      setActiveFigure(null);
      retainedSelection.current = [];
      const elements = convertToExcalidrawElements(skeletons, { regenerateIds: false });
      editor.setActiveTool({ type: 'selection' });
      editor.updateScene({
        elements: [...editor.getSceneElementsIncludingDeleted(), ...elements],
        ...(select
          ? {
              appState: {
                selectedElementIds: Object.fromEntries(elements.map((e) => [e.id, true])),
              },
            }
          : {}),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      editor.scrollToContent(elements, { fitToContent: true, viewportZoomFactor: 0.65 });
      return elements;
    };
    const selected = () => {
      const ids = new Set(selectionRef.current.ids);
      return editor.getSceneElementsIncludingDeleted().filter((e) => !e.isDeleted && ids.has(e.id));
    };
    const modify = (patch: (e: any) => any) => {
      if (readOnly || previewScene.current) return;
      const ids = new Set(selectionRef.current.ids);
      editor.updateScene({
        elements: editor
          .getSceneElementsIncludingDeleted()
          .map((e) => (ids.has(e.id) && !e.locked ? patch(e) : e)),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
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
      isSaved: () =>
        !diff().length && !pendingOperation.current && !textTasks.current.size && !editingDirty(),
      setTool(type) {
        if (readOnly || previewScene.current) return;
        figureKind.current = null;
        setActiveFigure(null);
        retainedSelection.current = [];
        inspectorOpen.current = false;
        const ink = type === 'pen' || type === 'marker';
        textTool.current = type === 'text';
        if (ink) inkTool.current = type;
        const profile = inkProfiles.current[inkTool.current];
        editor.updateScene({
          appState: {
            selectedElementIds: {},
            currentItemOpacity: ink ? profile.opacity : 100,
            currentItemStrokeWidth: ink
              ? profile.width / inkScale
              : editor.getAppState().currentItemStrokeWidth,
            currentItemStrokeColor: ink
              ? profile.color
              : editor.getAppState().currentItemStrokeColor,
            currentItemStrokeStyle: ink ? 'solid' : editor.getAppState().currentItemStrokeStyle,
          },
        });
        editor.setActiveTool(
          type === 'text'
            ? { type: 'custom', customType: 'board-text' }
            : { type: (ink ? 'freedraw' : type) as any },
        );
      },
      setColor(color) {
        if (!readOnly && !previewScene.current) {
          const state = editor.getAppState();
          if (state.activeTool.type === 'freedraw')
            inkProfiles.current[inkTool.current].color = color;
          const ids = Object.fromEntries(selectionRef.current.ids.map((id) => [id, true]));
          editor.updateScene({
            appState: { currentItemStrokeColor: color },
            elements: editor
              .getSceneElementsIncludingDeleted()
              .map((e) => (ids[e.id] && !e.locked ? changedElement(e, { strokeColor: color }) : e)),
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
        }
      },
      setWidth(width) {
        if (readOnly || previewScene.current) return;
        const state = editor.getAppState(),
          free = state.activeTool.type === 'freedraw',
          range = (
            free
              ? inkTool.current === 'marker'
              : selected().some((e) => e.customData?.inkTool === 'marker')
          )
            ? markerSizes
            : penSizes;
        width = Math.max(range.min, Math.min(range.max, width));
        if (free) inkProfiles.current[inkTool.current].width = width;
        const ids = new Set(selectionRef.current.ids);
        editor.updateScene({
          appState: { currentItemStrokeWidth: free ? width / inkScale : width },
          elements: editor.getSceneElementsIncludingDeleted().map((e) =>
            ids.has(e.id) && !e.locked
              ? changedElement(e, {
                  strokeWidth: e.type === 'freedraw' ? width / inkScale : width,
                })
              : e,
          ),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      },
      setOpacity(opacity) {
        if (readOnly || previewScene.current) return;
        opacity = Math.max(5, Math.min(100, opacity));
        if (editor.getAppState().activeTool.type === 'freedraw')
          inkProfiles.current[inkTool.current].opacity = opacity;
        const ids = new Set(selectionRef.current.ids);
        editor.updateScene({
          appState: { currentItemOpacity: opacity },
          elements: editor
            .getSceneElementsIncludingDeleted()
            .map((e) => (ids.has(e.id) && !e.locked ? changedElement(e, { opacity }) : e)),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      },
      setLineKind(kind) {
        if (readOnly || previewScene.current) return;
        figureKind.current = null;
        setActiveFigure(null);
        retainedSelection.current = [];
        textTool.current = false;
        lineKind.current = kind;
        const state = editor.getAppState();
        const width =
          state.activeTool.type === 'freedraw'
            ? state.currentItemStrokeWidth * inkScale
            : state.currentItemStrokeWidth;
        editor.setActiveTool({ type: 'line' });
        editor.updateScene({
          appState: {
            currentItemOpacity: 100,
            currentItemStrokeStyle:
              kind === 'dashed' ? 'dashed' : kind === 'dotted' ? 'dotted' : 'solid',
            currentItemStrokeWidth: Math.max(0.5, Math.min(6, width)),
            selectedElementIds: {},
          },
        });
      },
      async setTextStyle(style) {
        if (readOnly || previewScene.current) return;
        const patch = {
          ...(style.fontFamily !== undefined ? { family: String(style.fontFamily) } : {}),
          ...(style.fontSize ? { fontSize: style.fontSize } : {}),
          ...(style.text !== undefined ? { text: style.text } : {}),
          ...(style.color ? { color: style.color } : {}),
          ...(style.bold !== undefined ? { bold: style.bold } : {}),
          ...(style.italic !== undefined ? { italic: style.italic } : {}),
          ...(style.underline !== undefined ? { underline: style.underline } : {}),
          ...(style.textAlign ? { align: style.textAlign } : {}),
        };
        if (editingRef.current) {
          editText({ ...editingRef.current, model: { ...editingRef.current.model, ...patch } });
          return;
        }
        const jobs = [];
        for (const e of selected()) {
          const original = textModel(e);
          if (!original || e.locked) continue;
          const model = { ...(textDrafts.current.get(e.id) || original), ...patch };
          if (model.containerId) {
            const parent = editor.getSceneElements().find((p) => p.id === model.containerId);
            if (parent) model.maxWidth = Math.max(40, parent.width - 32);
          }
          textDrafts.current.set(e.id, model);
          jobs.push(commitText({ id: e.id, x: e.x, y: e.y, angle: e.angle, model }));
        }
        await Promise.all(jobs);
      },
      editText() {
        const target = selected().find((e) => textModel(e));
        if (target && !target.locked) beginTextEditing(target);
      },
      objectAction(action) {
        if (readOnly || previewScene.current) return;
        const all = editor.getSceneElementsIncludingDeleted(),
          ids = new Set(selectionRef.current.ids);
        for (const id of [...ids]) for (const child of objectSelection(all, id)) ids.add(child);
        if (action === 'duplicate') {
          const copies = duplicateObjects(all, ids);
          const next = restoreElements([...all, ...copies], null);
          editor.updateScene({
            elements: next,
            appState: { selectedElementIds: Object.fromEntries(copies.map((e) => [e.id, true])) },
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
          return;
        }
        if (action === 'delete') {
          for (const e of all)
            if (
              ids.has(e.customData?.stickerAnnotation?.stickerId) ||
              ids.has(e.customData?.slideAnnotation?.presentationId)
            )
              ids.add(e.id);
          retainedSelection.current = [];
          editor.updateScene({
            elements: all.map((e) => (ids.has(e.id) ? changedElement(e, { isDeleted: true }) : e)),
            appState: { selectedElementIds: {} },
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
          return;
        }
        const moved = all.filter((e) => ids.has(e.id)).map((e) => ({ ...e, index: undefined })),
          rest = all.filter((e) => !ids.has(e.id));
        const ordered = restoreElements(
            (action === 'front' ? [...rest, ...moved] : [...moved, ...rest]) as any,
            null,
          ),
          old = new Map(all.map((e) => [e.id, e]));
        editor.updateScene({
          elements: ordered.map((e) =>
            e.index !== old.get(e.id)?.index
              ? changedElement(old.get(e.id), { index: e.index })
              : old.get(e.id)!,
          ),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      },
      setFill(color) {
        if (readOnly || previewScene.current) return;
        editor.updateScene({
          appState: { currentItemBackgroundColor: color, currentItemFillStyle: 'solid' },
        });
        modify((e) => changedElement(e, { backgroundColor: color, fillStyle: 'solid' }));
      },
      setFigureKind(kind) {
        if (readOnly || previewScene.current) return;
        figureKind.current = kind;
        textTool.current = false;
        setActiveFigure(kind);
        retainedSelection.current = [];
        editor.setActiveTool({ type: 'custom', customType: 'board-figure' });
        editor.updateScene({
          appState: {
            selectedElementIds: {},
            currentItemOpacity: 100,
            currentItemStrokeWidth: Math.min(
              3,
              Math.max(0.5, editor.getAppState().currentItemStrokeWidth),
            ),
          },
        });
      },
      ungroup() {
        modify((e) =>
          changedElement(e, {
            groupIds: [],
            customData: { ...e.customData, boardFigure: undefined },
          }),
        );
      },
      async addSticker(kind, color, text = '') {
        if (readOnly || previewScene.current) return;
        const { x, y } = center(),
          group = crypto.randomUUID(),
          id = crypto.randomUUID();
        const parent = add(
          [
            {
              id,
              type: 'rectangle',
              x,
              y,
              width: 240,
              height: 180,
              backgroundColor: color,
              fillStyle: 'solid',
              strokeColor: 'transparent',
              roughness: 0,
              roundness: { type: 3 },
              groupIds: [group],
              customData: { sticker: { kind: 'note' } },
            },
          ],
          true,
        )[0];
        const value: TextEditing = {
          id: crypto.randomUUID(),
          x: x + 12,
          y: y + 12,
          angle: 0,
          model: { ...defaultText, fontSize: 20, text, containerId: id, maxWidth: 208 },
          groupIds: [group],
        };
        await commitText(value);
        if (parent && !text)
          beginTextEditing(editor.getSceneElements().find((e) => e.id === value.id));
      },
      async addPictureSticker(id) {
        if (readOnly || previewScene.current) return;
        const item = pictureStickers.find((s) => s.id === id);
        if (!item) return;
        const response = await fetch(item.src);
        if (!response.ok) throw new Error('Не удалось загрузить стикер');
        const blob = await response.blob(),
          fileId = crypto.randomUUID(),
          { x, y } = center();
        const file = {
          id: fileId,
          dataURL: await blobDataUrl(blob),
          mimeType: 'image/webp',
          created: Date.now(),
        } as any;
        fileData.current = { ...fileData.current, [fileId]: file };
        editor.addFiles([file]);
        add(
          [
            {
              id: crypto.randomUUID(),
              type: 'image',
              x,
              y,
              width: 220,
              height: 220,
              fileId,
              status: 'saved',
              customData: { pictureSticker: { id: item.id, name: item.name } },
            },
          ],
          true,
        );
      },
      async addFormula(text, title = 'Формула') {
        inspectorOpen.current = false;
        const { x, y } = center();
        await commitText({
          id: crypto.randomUUID(),
          x,
          y,
          angle: 0,
          model: { ...defaultText, text, fontSize: 28 },
          customData: { formula: { title } },
        });
      },
      showInspector(show) {
        inspectorOpen.current = show;
        reportTools(editor.getSceneElementsIncludingDeleted(), editor.getAppState());
      },
      lockSelection() {
        if (readOnly || previewScene.current) return;
        const chosen = selected(),
          ids = new Set(chosen.flatMap((e) => objectSelection(editor.getSceneElements(), e.id)));
        for (const e of chosen) {
          if (e.type === 'text' && e.containerId) ids.add(e.containerId);
          for (const b of e.boundElements || []) if (b.type === 'text') ids.add(b.id);
        }
        const unlock = chosen.length > 0 && chosen.every((e) => e.locked);
        retainedSelection.current = [...ids];
        editor.updateScene({
          elements: editor
            .getSceneElementsIncludingDeleted()
            .map((e) => (ids.has(e.id) ? changedElement(e, { locked: !unlock }) : e)),
          appState: {
            selectedElementIds: Object.fromEntries([...ids].map((id) => [id, true])),
            selectedLinearElement: null,
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      },
      selectObject(id) {
        const e = editor.getSceneElements().find((e) => e.id === id);
        if (!e) return;
        inspectorOpen.current = true;
        textTool.current = false;
        retainedSelection.current = objectSelection(editor.getSceneElements(), id);
        figureKind.current = null;
        setActiveFigure(null);
        editor.setActiveTool({ type: 'selection' });
        editor.updateScene({
          appState: {
            selectedElementIds: Object.fromEntries(
              retainedSelection.current.map((key) => [key, true]),
            ),
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        if (presentationOf(e)) {
          selectedDeckRef.current = id;
          setSelectedDeck(id);
        }
        editor.scrollToContent([e], { fitToContent: true, viewportZoomFactor: 0.6 });
      },
      undo(redo = false) {
        if (readOnly || previewScene.current) return;
        const root =
          document.querySelector('.lesson-embedded .excalidraw') ||
          document.querySelector('.excalidraw');
        (root as HTMLElement)?.focus();
        root?.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'z',
            code: 'KeyZ',
            ctrlKey: true,
            metaKey: true,
            shiftKey: redo,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      zoomBy(amount) {
        const a = editor.getAppState(),
          zoom = Math.max(0.1, Math.min(3, a.zoom.value + amount));
        const x = -a.scrollX + a.width / (2 * a.zoom.value),
          y = -a.scrollY + a.height / (2 * a.zoom.value);
        editor.updateScene({
          appState: {
            zoom: { value: zoom as any },
            scrollX: a.width / (2 * zoom) - x,
            scrollY: a.height / (2 * zoom) - y,
          },
        });
      },
      fit() {
        const visible = restoreElements(
          projectCanvas(previewScene.current || current.current).filter((e) => !e.isDeleted),
          null,
        );
        if (visible.length)
          editor.scrollToContent(visible, { fitToContent: true, viewportZoomFactor: 0.8 });
      },
      slide: changeSlide,
      async preview(scene, background) {
        figureKind.current = null;
        setActiveFigure(null);
        if (scene) {
          await flush();
          if (diff().length || pendingOperation.current)
            throw new Error('Дождитесь сохранения текущих изменений');
          await loadFiles(scene, editor);
        }
        previewScene.current = scene;
        setPreviewing(!!scene);
        selectedDeckRef.current = '';
        setSelectedDeck('');
        setPreviewBackground(scene ? background || null : null);
        deckStamp.current = '';
        const shown = scene || current.current;
        editor.updateScene({
          elements: restoreElements(projectCanvas(shown), null),
          appState: { viewModeEnabled: readOnly || !!scene },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        publishDecks();
        const visible = restoreElements(
          projectCanvas(shown).filter((e) => !e.isDeleted),
          null,
        );
        if (visible.length)
          editor.scrollToContent(visible, { fitToContent: true, viewportZoomFactor: 0.8 });
      },
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
        figureKind.current = null;
        setActiveFigure(null);
        retainedSelection.current = [];
        editor.setActiveTool({ type: 'selection' });
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
          appState: {
            selectedElementIds: Object.fromEntries(
              elements.filter((e) => e.type === 'image').map((e) => [e.id, true]),
            ),
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        editor.scrollToContent(elements, { fitToContent: true, viewportZoomFactor: 0.75 });
        void loadFiles([], editor, true)
          .then(publishDecks)
          .catch((e) => toast(e.message));
      },
      setPen(highlight) {
        handleRef.current?.setTool(highlight ? 'marker' : 'pen');
      },
      addTemplate(kind) {
        if (kind === 'note') {
          void handleRef.current?.addSticker('note', '#fff0a8', '');
          return;
        }
        handleRef.current?.setTool('text');
      },
      async previewExport(options) {
        if (textTasks.current.size) await Promise.all([...textTasks.current]);
        const canvas = await renderExportCanvas(options, true);
        return canvas.toDataURL('image/png');
      },
      async export(type, options = defaultExport) {
        const elements = editor.getSceneElements(),
          appState = editor.getAppState(),
          files = editor.getFiles();
        const name = board.title;
        if (type === 'scene') {
          const allSlides = (previewScene.current || current.current).flatMap((e) =>
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
                    elements: previewScene.current || current.current,
                    appState: { viewBackgroundColor: '#fff' },
                    osnova: { background: previewBackground || board.background || 'white' },
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
        const canvas = await renderExportCanvas(options);
        const blob = await canvasBlob(canvas);
        if (type === 'png') download(blob, `${name}.png`);
        else {
          const pdf = await PDFDocument.create(),
            image = await pdf.embedPng(await blob.arrayBuffer()),
            layout = pdfLayout(image.width, image.height, options.paper, options.orientation),
            page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
          page.drawImage(image, {
            x: layout.x,
            y: layout.y,
            width: layout.width,
            height: layout.height,
          });
          download(
            new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' }),
            `${name}.pdf`,
          );
        }
      },
    };
  });
  const resetSurfaceGesture = () => {
    const gesture = surfaceGesture.current;
    if (gesture?.kind === 'object' && pointerDown.current && editor) {
      pointerDown.current = false;
      objectInteracting.current = false;
      inspectorOpen.current = false;
      editor.updateScene({ elements: gesture.elements, captureUpdate: CaptureUpdateAction.NEVER });
      dragStart.current = null;
      releaseGestureWaiters();
      reportTools(editor.getSceneElementsIncludingDeleted(), editor.getAppState());
      const queued = remoteQueue.current.splice(0);
      void (async () => {
        for (const payload of queued) await applyRemote(payload);
      })().catch((e) => onSave('error', e.message));
    }
    surfaceGesture.current = null;
    if (gesture && surface.current?.hasPointerCapture(gesture.id))
      surface.current.releasePointerCapture(gesture.id);
    setDrawing(null);
    setPanning(false);
  };
  const cancelFigure = () => {
    resetSurfaceGesture();
    if (figureKind.current) {
      figureKind.current = null;
      setActiveFigure(null);
      editor?.setActiveTool({ type: 'selection' });
    }
  };
  useEffect(() => {
    const blur = () => resetSurfaceGesture();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (surfaceGesture.current || figureKind.current)) {
        event.preventDefault();
        cancelFigure();
      }
    };
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', escape, true);
    };
  }, [editor]);
  const surfaceDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editor || !(event.target instanceof HTMLCanvasElement) || !ready.current) return;
    const state = editor.getAppState();
    let gesture: SurfaceGesture | null = null;
    if (event.pointerType === 'mouse' && event.button === 2) {
      gesture = {
        kind: 'pan',
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        zoom: state.zoom.value,
      };
      setPanning(true);
    } else if (event.button === 0 && event.isPrimary && !readOnly && !previewScene.current) {
      const point = viewportCoordsToSceneCoords(event, state);
      if (textTool.current) {
        const hit = canvasHit(editor.getSceneElements(), point, 6 / state.zoom.value);
        if (hit && (textModel(hit) || hit.customData?.sticker)) beginTextEditing(hit);
        else
          editText({
            id: crypto.randomUUID(),
            x: point.x,
            y: point.y,
            angle: 0,
            model: { ...defaultText },
          });
        gesture = { kind: 'text', id: event.pointerId };
      } else if (figureKind.current) {
        gesture = {
          kind: 'figure',
          id: event.pointerId,
          figure: figureKind.current,
          start: [point.x, point.y],
          end: [point.x, point.y],
          constrain: event.shiftKey,
          color: state.currentItemStrokeColor,
          width: state.currentItemStrokeWidth,
          fill: state.currentItemBackgroundColor,
        };
      } else if (state.activeTool.type === 'selection') {
        const elements = unmaskText(editor.getSceneElementsIncludingDeleted());
        const hit = movableHit(elements, point, 4 / state.zoom.value);
        if (hit) {
          const objectIds = objectSelection(elements, hit.id),
            previous = selectionRef.current.ids;
          const selected = new Set(
            event.shiftKey || objectIds.some((id) => previous.includes(id)) ? previous : [],
          );
          const remove = event.shiftKey && objectIds.every((id) => selected.has(id));
          for (const id of objectIds) remove ? selected.delete(id) : selected.add(id);
          retainedSelection.current = [...selected];
          inspectorOpen.current = false;
          objectInteracting.current = true;
          editor.updateScene({
            appState: {
              selectedElementIds: Object.fromEntries([...selected].map((id) => [id, true])),
              selectedLinearElement: null,
              editingLinearElement: null,
            },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          reportTools(editor.getSceneElementsIncludingDeleted(), editor.getAppState());
          pointerDown.current = true;
          gestureEpoch.current++;
          dragStart.current = current.current;
          gesture = {
            kind: 'object',
            id: event.pointerId,
            start: [point.x, point.y],
            ids: movingObjectIds(elements, [...selected]),
            elements,
            moved: false,
            dx: 0,
            dy: 0,
            locked: !!hit.locked || !selected.size,
          };
        } else {
          nativeStart.current = { x: event.clientX, y: event.clientY, clicked: false };
          inspectorOpen.current = false;
        }
      }
    }
    if (!gesture) return;
    event.preventDefault();
    event.stopPropagation();
    surfaceGesture.current = gesture;
    event.currentTarget.querySelector<HTMLElement>('.excalidraw')?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const surfaceMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = surfaceGesture.current;
    if (!gesture || gesture.id !== event.pointerId || !editor) return;
    event.preventDefault();
    event.stopPropagation();
    if (gesture.kind === 'pan') {
      if (!(event.buttons & 2)) return resetSurfaceGesture();
      editor.updateScene({
        appState: {
          scrollX: gesture.scrollX + (event.clientX - gesture.x) / gesture.zoom,
          scrollY: gesture.scrollY + (event.clientY - gesture.y) / gesture.zoom,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    } else if (gesture.kind === 'object') {
      const point = viewportCoordsToSceneCoords(event, editor.getAppState()),
        dx = point.x - gesture.start[0],
        dy = point.y - gesture.start[1];
      if (
        gesture.locked ||
        (!gesture.moved && Math.hypot(dx, dy) * editor.getAppState().zoom.value < 5)
      )
        return;
      gesture.moved = true;
      gesture.dx = dx;
      gesture.dy = dy;
      editor.updateScene({
        elements: translateObjects(gesture.elements, gesture.ids, dx, dy),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      sendCursor(point);
    } else if (gesture.kind === 'figure') {
      const point = viewportCoordsToSceneCoords(event, editor.getAppState());
      gesture.end = [point.x, point.y];
      gesture.constrain = event.shiftKey;
      setDrawing({
        parts: figureFromDrag(gesture.figure, gesture.start, gesture.end, gesture.constrain).parts,
        color: gesture.color,
        width: gesture.width,
      });
    }
  };
  const surfaceUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = surfaceGesture.current;
    if (!gesture) {
      if (nativeStart.current)
        nativeStart.current.clicked =
          Math.hypot(event.clientX - nativeStart.current.x, event.clientY - nativeStart.current.y) <
          5;
      return;
    }
    if (gesture.id !== event.pointerId || !editor) return;
    event.preventDefault();
    event.stopPropagation();
    let editAfterGesture: any;
    if (gesture.kind === 'object') {
      const key = [...gesture.ids].sort().join('|'),
        last = lastObjectClick.current;
      const twice =
        !gesture.moved &&
        !gesture.locked &&
        last?.key === key &&
        event.timeStamp - last.at < 450 &&
        Math.hypot(gesture.start[0] - last.x, gesture.start[1] - last.y) *
          editor.getAppState().zoom.value <
          6;
      lastObjectClick.current =
        gesture.moved || twice
          ? null
          : { key, at: event.timeStamp, x: gesture.start[0], y: gesture.start[1] };
      if (twice)
        editAfterGesture = editor
          .getSceneElements()
          .find((e) => gesture.ids.has(e.id) && (textModel(e) || e.customData?.sticker));
      pointerDown.current = false;
      objectInteracting.current = false;
      inspectorOpen.current = !gesture.moved;
      const shifted = translateObjects(gesture.elements, gesture.ids, gesture.dx, gesture.dy);
      const next = shifted.map((e, i) =>
        gesture.moved && e !== gesture.elements[i]
          ? changedElement(gesture.elements[i], { x: e.x, y: e.y })
          : e,
      );
      editor.updateScene({
        elements: next,
        appState: {
          selectedElementIds: Object.fromEntries(retainedSelection.current.map((id) => [id, true])),
        },
        captureUpdate: gesture.moved ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER,
      });
      if (gesture.moved)
        captureRendered(
          editor.getSceneElementsIncludingDeleted(),
          dragStart.current || current.current,
        );
      dragStart.current = null;
      releaseGestureWaiters();
      reportTools(editor.getSceneElementsIncludingDeleted(), editor.getAppState());
      if (deferredRender.current) renderScene();
      const queued = remoteQueue.current.splice(0);
      void (async () => {
        for (const payload of queued) await applyRemote(payload);
      })().catch((e) => onSave('error', e.message));
    }
    resetSurfaceGesture();
    if (editAfterGesture) {
      beginTextEditing(editAfterGesture);
      return;
    }
    if (gesture.kind !== 'figure') return;
    const point = viewportCoordsToSceneCoords(event, editor.getAppState());
    const end: [number, number] = [point.x, point.y];
    if (
      Math.hypot(end[0] - gesture.start[0], end[1] - gesture.start[1]) *
        editor.getAppState().zoom.value <
      5
    )
      return;
    if (readOnly || previewScene.current || !ready.current) return;
    const { spec, parts } = figureFromDrag(gesture.figure, gesture.start, end, event.shiftKey),
      group = crypto.randomUUID();
    const elements = convertToExcalidrawElements(
      parts.map((e, i) => ({
        ...e,
        id: crypto.randomUUID(),
        strokeColor: gesture.color,
        strokeWidth: gesture.width,
        backgroundColor: gesture.fill,
        fillStyle: 'solid',
        groupIds: [group],
        customData: { boardFigure: { id: group, spec, part: i } },
      })),
      { regenerateIds: false },
    );
    figureKind.current = null;
    setActiveFigure(null);
    editor.setActiveTool({ type: 'selection' });
    editor.updateScene({
      elements: [...editor.getSceneElementsIncludingDeleted(), ...elements],
      appState: { selectedElementIds: Object.fromEntries(elements.map((e) => [e.id, true])) },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };
  if (error)
    return (
      <div className="fatal">
        <FormError error={error} />
        <Button onClick={() => location.reload()}>Повторить</Button>
      </div>
    );
  if (!initial) return <Busy />;
  return (
    <div
      className={`board-surface ${panning ? 'is-panning' : ''} ${activeFigure ? 'is-drawing-figure' : ''}`}
      ref={surface}
      onPointerDownCapture={surfaceDown}
      onPointerMoveCapture={surfaceMove}
      onPointerUpCapture={surfaceUp}
      onPointerCancelCapture={resetSurfaceGesture}
      onLostPointerCapture={resetSurfaceGesture}
      onContextMenuCapture={(event) => {
        if (event.target instanceof HTMLCanvasElement || surfaceGesture.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDoubleClickCapture={(event) => {
        if (
          !editor ||
          !(event.target instanceof HTMLCanvasElement || event.target === surface.current) ||
          readOnly ||
          previewScene.current ||
          editor.getAppState().activeTool.type !== 'selection'
        )
          return;
        if (editingRef.current) return;
        const point = viewportCoordsToSceneCoords(event, editor.getAppState()),
          hit = movableHit(editor.getSceneElements(), point, 4 / editor.getAppState().zoom.value);
        event.preventDefault();
        event.stopPropagation();
        if (hit && !hit.locked && (textModel(hit) || hit.customData?.sticker))
          beginTextEditing(hit);
        else if (!hit)
          editText({
            id: crypto.randomUUID(),
            x: point.x,
            y: point.y,
            angle: 0,
            model: { ...defaultText },
          });
      }}
    >
      <div
        className="canvas-paper"
        data-background={previewBackground || board.background || 'white'}
        style={backgroundStyle(
          previewBackground || board.background || 'white',
          view.zoom,
          view.scrollX,
          view.scrollY,
        )}
      />
      <Excalidraw
        excalidrawAPI={setEditor}
        initialData={initial}
        langCode="ru-RU"
        theme="light"
        name={board.title}
        viewModeEnabled={readOnly || previewing}
        isCollaborating={true}
        validateEmbeddable={false}
        aiEnabled={false}
        UIOptions={{
          canvasActions: {
            loadScene: !readOnly && !previewing,
            saveToActiveFile: false,
            export: false,
            changeViewBackgroundColor: false,
            toggleTheme: false,
          },
        }}
        onChange={(elements, state, files) => {
          updateView({
            scrollX: state.scrollX,
            scrollY: state.scrollY,
            zoom: state.zoom.value,
            width: state.width,
            height: state.height,
          });
          reportTools(elements, state);
          if (!ready.current) return;
          if (state.gridModeEnabled) editor?.updateScene({ appState: { gridModeEnabled: false } });
          fileData.current = files;
          // The live stroke belongs to the native engine. Do not clone, project, save or
          // reconcile it on each sample (a pen may send hundreds of samples per second).
          if (pointerDown.current || readOnly || previewScene.current) return;
          const version = elements.reduce((n, e) => n + e.version, 0);
          if (nativeScene.current?.elements === elements && nativeScene.current.version === version)
            return;
          nativeScene.current = { elements, version };
          captureRendered(elements);
        }}
        onScrollChange={(scrollX, scrollY, zoom) =>
          updateView({ ...viewRef.current, scrollX, scrollY, zoom: zoom.value })
        }
        onPointerUpdate={(payload) => sendCursor({ x: payload.pointer.x, y: payload.pointer.y })}
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
              {previewing ? 'В этой версии холст пуст' : 'Каждый урок — новое открытие'}
            </WelcomeScreen.Center.Heading>
            <div className="canvas-welcome-text">
              {previewing
                ? 'У этого сохранения ещё нет объектов.'
                : 'Начните с текста, рисунка или загрузите рабочий лист.'}
              <br />
              {!previewing && 'Всё сохранится в вашем пространстве.'}
            </div>
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </Excalidraw>
      {textEditing && (
        <RichTextEditor
          value={textEditing}
          view={view}
          onChange={(model) => editText({ ...editingRef.current!, model })}
          onCommit={closeText}
          onCancel={closeText}
        />
      )}
      {activeFigure && (
        <div className="board-drawing-hint" role="status">
          {figures.find((f) => f.id === activeFigure)?.name} · протяните по холсту
          <button type="button" aria-label="Отменить рисование фигуры" onClick={cancelFigure}>
            <X size={15} />
          </button>
        </div>
      )}
      {drawing &&
        (() => {
          const x = Math.min(...drawing.parts.map((p) => p.x)),
            y = Math.min(...drawing.parts.map((p) => p.y)),
            width = Math.max(...drawing.parts.map((p) => p.x + p.width)) - x,
            height = Math.max(...drawing.parts.map((p) => p.y + p.height)) - y;
          return (
            <div
              className="board-drawing-preview"
              aria-hidden="true"
              style={{
                left: (x + view.scrollX) * view.zoom,
                top: (y + view.scrollY) * view.zoom,
                width: width * view.zoom,
                height: height * view.zoom,
                color: drawing.color,
              }}
            >
              <VectorPreview
                parts={drawing.parts}
                padding={0}
                strokeWidth={drawing.width * view.zoom}
              />
            </div>
          );
        })()}
      <div className="presentation-overlay">
        {decks.map((deck) => {
          const x = (deck.x + view.scrollX) * view.zoom,
            y = (deck.y + view.scrollY) * view.zoom,
            w = deck.width * view.zoom;
          if (x + w < 0 || x > view.width || y > view.height) return null;
          return (
            <button
              className="presentation-select"
              key={deck.id}
              style={{
                pointerEvents:
                  readOnly || previewing || editor?.getAppState().activeTool.type === 'selection'
                    ? 'auto'
                    : 'none',
                left: Math.max(65, Math.min(x + 8, view.width - 120)),
                top: Math.max(70, y + 8),
              }}
              aria-label={`Выделить презентацию: ${presentationOf(deck)!.title}`}
              onClick={() => handleRef.current?.selectObject(deck.id)}
            >
              <FileText size={15} />
              <span>{presentationOf(deck)!.title}</span>
            </button>
          );
        })}
        {decks
          .filter((deck) => deck.id === selectedDeck)
          .map((deck) => {
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
                    disabled={
                      (readOnly && !previewScene.current) || !!switching || p.slideIndex === 0
                    }
                    onClick={() => changeSlide(deck.id, p.slideIndex - 1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <label>
                    <span className="sr-only">Слайд презентации {p.title}</span>
                    <select
                      value={p.slideIndex}
                      disabled={(readOnly && !previewScene.current) || !!switching}
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
                    disabled={
                      (readOnly && !previewScene.current) ||
                      !!switching ||
                      p.slideIndex === p.slides.length - 1
                    }
                    onClick={() => changeSlide(deck.id, p.slideIndex + 1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
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
  editor,
  embedded,
}: {
  pageId: string;
  revision: () => number;
  onClose: () => void;
  editor?: React.MutableRefObject<EditorHandle | null>;
  embedded?: boolean;
}) {
  const { toast } = useApp();
  const [list, setList] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    void (async () => {
      await editor?.current?.flush();
      setList(await api(`/pages/${pageId}/history`));
    })().catch((e) => setError(e.message));
    return () => {
      void editor?.current?.preview(null);
    };
  }, [pageId]);
  const leave = async () => {
    await editor?.current?.preview(null);
    onClose();
  };
  const select = async (version: any) => {
    setBusy(true);
    setError('');
    try {
      const snapshot = await api(`/pages/${pageId}/history/${version.id}`);
      await editor?.current?.preview(snapshot.scene, snapshot.background);
      setSelected(version);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {selected && (
        <div className="lesson-preview-banner">
          <History size={18} />
          <strong>Просмотр сохранённой версии</strong>
          <span>{date(selected.created_at, { hour: '2-digit', minute: '2-digit' })} МСК</span>
          <button
            onClick={async () => {
              await editor?.current?.preview(null);
              setSelected(null);
            }}
          >
            Вернуться к текущей
          </button>
        </div>
      )}
      <div className={`lesson-history-modal ${embedded ? 'embedded-history' : ''}`}>
        <Modal title="История уроков" onClose={() => void leave()}>
          <p className="muted">Этапы занятий и последние изменения общего холста.</p>
          <FormError error={error} />
          <div className="lesson-version-list">
            <button
              className={`lesson-version ${!selected ? 'active' : ''}`}
              onClick={async () => {
                await editor?.current?.preview(null);
                setSelected(null);
              }}
            >
              <span className="version-dot" />
              <div>
                <strong>Текущий холст</strong>
                <small>Версия {revision()} · все участники</small>
              </div>
              <Badge tone="mint">Текущая</Badge>
            </button>
            {list.map((v) => (
              <button
                disabled={busy}
                key={v.id}
                className={`lesson-version ${selected?.id === v.id ? 'active' : ''}`}
                onClick={() => void select(v)}
              >
                <span className="version-dot" />
                <div>
                  <strong>
                    {date(v.created_at, { hour: '2-digit', minute: '2-digit' })} ·{' '}
                    {v.label || 'Изменения доски'}
                  </strong>
                  <small>
                    {v.lesson_title || v.author} · версия {v.revision}
                  </small>
                </div>
              </button>
            ))}
          </div>
          {selected && (
            <div className="lesson-version-detail">
              <h3>{selected.label || 'Сохранённая версия'}</h3>
              <p>{selected.lesson_title || 'Общий учебный холст'}</p>
              <p className="muted">
                {selected.author} ·{' '}
                {date(selected.created_at, { hour: '2-digit', minute: '2-digit' })}
              </p>
              <Button
                disabled={busy || selected.revision === revision()}
                onClick={() => setConfirm(true)}
              >
                Восстановить эту версию
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await editor?.current?.export('scene');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Download size={17} />
                Скачать копию
              </Button>
            </div>
          )}
          {!list.length && <Empty title="История начнётся с первого изменения" />}
          <p className="lesson-history-foot">
            При восстановлении текущая версия тоже останется в истории.
          </p>
        </Modal>
      </div>
      {confirm && (
        <Confirm
          title="Восстановить версию?"
          text="Текущий холст попадёт в историю. Участники увидят восстановленную версию."
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api(`/pages/${pageId}/restore`, {
              snapshotId: selected.id,
              expectedRevision: revision(),
            });
            toast('Версия восстановлена');
            setConfirm(false);
            await leave();
          }}
        />
      )}
    </>
  );
}
