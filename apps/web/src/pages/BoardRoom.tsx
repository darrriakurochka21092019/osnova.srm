import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
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
  Plus,
  Upload,
  Download,
  History,
  Users,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  Pencil,
  Layers,
  FileText,
  Check,
  WifiOff,
  LoaderCircle,
  Grip,
  Highlighter,
  PenLine,
  BookOpen,
  MousePointer2,
  CircleHelp,
  Link as LinkIcon,
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
import type { Asset, Board, ElementData, Page } from '../../../../packages/contracts';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
(window as any).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
type SaveState = 'saved' | 'saving' | 'offline' | 'error';
type EditorHandle = {
  flush: () => Promise<void>;
  export: (type: 'png' | 'pdf' | 'scene') => Promise<void>;
  addSyntax: (kind: string) => void;
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
      (b) => (b ? resolve(b) : reject(new Error('Не удалось подготовить страницу'))),
      'image/png',
    ),
  );
}

export default function BoardRoom() {
  const { id } = useParams(),
    navigate = useNavigate(),
    [search, setSearch] = useSearchParams(),
    { user, toast, refresh } = useApp();
  const [board, setBoard] = useState<Board | null>(null),
    [pageId, setPageId] = useState(''),
    [loadError, setLoadError] = useState(''),
    [save, setSave] = useState<SaveState>('saved'),
    [saveError, setSaveError] = useState(''),
    [pagesOpen, setPagesOpen] = useState(window.innerWidth > 900),
    [syntaxOpen, setSyntaxOpen] = useState(false),
    [inviteOpen, setInviteOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [rename, setRename] = useState<{ type: 'board' | 'page'; id: string; title: string } | null>(
      null,
    ),
    [deletePage, setDeletePage] = useState<Page | null>(null),
    [importStatus, setImportStatus] = useState(''),
    [filesOpen, setFilesOpen] = useState(false),
    [assets, setAssets] = useState<Asset[]>([]),
    [help, setHelp] = useState(false);
  const handle = useRef<EditorHandle | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    [peers, setPeers] = useState<{ id: string; name: string }[]>([]),
    [conflict, setConflict] = useState<{ elements: any[]; files: any } | null>(null),
    importing = useRef(false);
  const load = useCallback(async () => {
    try {
      const b = await api<Board>(`/boards/${id}`);
      setBoard(b);
      setPageId((p) => {
        const desired = p || localStorage.getItem(`osnova-page:${user.id}:${id}`);
        return b.pages?.some((x) => x.id === desired) ? desired! : b.pages?.[0]?.id || '';
      });
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (pageId) localStorage.setItem(`osnova-page:${user.id}:${id}`, pageId);
  }, [pageId]);
  const readOnly = board?.permission === 'view' || !!board?.archived;
  const importFile = useCallback(
    async (file: File) => {
      if (!board || readOnly || importing.current) return;
      importing.current = true;
      setImportStatus('Сохраняем исходный файл…');
      try {
        await handle.current?.flush();
        const original = await upload(file, { boardId: board.id });
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
            if (pdf.numPages > 30) throw new Error('В одном PDF должно быть не больше 30 страниц');
            let first = '';
            for (let n = 1; n <= pdf.numPages; n++) {
              setImportStatus(`Готовим страницу ${n} из ${pdf.numPages}…`);
              const pdfPage = await pdf.getPage(n),
                viewport = pdfPage.getViewport({ scale: 1.75 }),
                canvas = document.createElement('canvas');
              canvas.width = Math.ceil(viewport.width);
              canvas.height = Math.ceil(viewport.height);
              await pdfPage.render({ canvas, viewport }).promise;
              const blob = await canvasBlob(canvas),
                fileId = crypto.randomUUID();
              await upload(blob, {
                boardId: board.id,
                excalidrawId: fileId,
                name: `pdf-page-${n}-${file.name}.png`,
              });
              const p = await api<Page>(`/boards/${board.id}/pages`, {
                title: `${file.name.replace(/\.pdf$/i, '')} · ${n}`,
              });
              if (!first) first = p.id;
              const elements = convertToExcalidrawElements([
                {
                  type: 'image',
                  x: 0,
                  y: 0,
                  width: viewport.width / 1.75,
                  height: viewport.height / 1.75,
                  fileId: fileId as any,
                  locked: true,
                  status: 'saved',
                  customData: { pdfSourceId: original.id, pdfPage: n },
                },
              ]);
              await api(`/pages/${p.id}/operations`, {
                operationId: crypto.randomUUID(),
                changes: elements.map((element) => ({ element, baseVersion: null })),
              });
              canvas.width = 0;
              canvas.height = 0;
              pdfPage.cleanup();
            }
            await load();
            setPageId(first);
            toast(`PDF добавлен: ${pdf.numPages} стр.`);
          } finally {
            await loadingTask.destroy();
          }
        } else {
          const fileId = crypto.randomUUID();
          await upload(file, { boardId: board.id, excalidrawId: fileId, name: file.name });
          const image = new Image();
          const dataURL = await blobDataUrl(file);
          image.src = dataURL;
          await image.decode();
          const p = await api<Page>(`/boards/${board.id}/pages`, { title: file.name });
          const width = Math.min(image.width, 1200),
            height = image.height * (width / image.width);
          const elements = convertToExcalidrawElements([
            {
              type: 'image',
              x: 0,
              y: 0,
              width,
              height,
              fileId: fileId as any,
              status: 'saved',
              locked: false,
              customData: { sourceId: original.id },
            },
          ]);
          await api(`/pages/${p.id}/operations`, {
            operationId: crypto.randomUUID(),
            changes: elements.map((element) => ({ element, baseVersion: null })),
          });
          await load();
          setPageId(p.id);
          toast('Изображение добавлено');
        }
        await refresh();
      } catch (e) {
        toast((e as Error).message);
      } finally {
        importing.current = false;
        setImportStatus('');
      }
    },
    [board, readOnly, load],
  );
  useEffect(() => {
    const assetId = search.get('import');
    if (!board || !assetId || importing.current) return;
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
  }, [board?.id, search]);
  const selectPage = async (id: string) => {
    if (id === pageId) return;
    if (save !== 'saved') {
      toast('Дождитесь сохранения или восстановления связи перед сменой страницы');
      return;
    }
    setPageId(id);
    if (window.innerWidth < 900) setPagesOpen(false);
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
  if (!board) return <Busy />;
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
          <button
            disabled={user.role !== 'teacher'}
            onClick={() => setRename({ type: 'board', id: board.id, title: board.title })}
          >
            {board.title}
            <Pencil size={13} />
          </button>
          <span className={`save-state ${save}`} role="status">
            {save === 'saved' ? (
              <Check size={12} />
            ) : save === 'saving' ? (
              <LoaderCircle size={12} className="spin" />
            ) : (
              <WifiOff size={12} />
            )}{' '}
            {save === 'saved'
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
          <button
            className="icon-btn"
            title="Как работать на доске"
            aria-label="Помощь по доске"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={20} />
          </button>
          <Button variant="secondary" onClick={() => setExportOpen(true)}>
            <Download size={16} />
            <span>Экспорт</span>
          </Button>
          {user.role === 'teacher' && (
            <Button onClick={() => setInviteOpen(true)} disabled={board.archived}>
              <Users size={16} />
              <span>Пригласить</span>
            </Button>
          )}
        </div>
      </header>
      <div className="board-actionbar">
        <div className="button-row">
          <button
            className={`board-action ${pagesOpen ? 'selected' : ''}`}
            onClick={() => setPagesOpen(!pagesOpen)}
          >
            <Layers size={16} />
            Страницы <span>{board.pages?.length}</span>
          </button>
          {!readOnly && (
            <>
              <button
                className="board-action"
                onClick={() => fileInput.current?.click()}
                disabled={!!importStatus}
              >
                <Upload size={16} />
                Загрузить
              </button>
              <button
                className={`board-action ${syntaxOpen ? 'selected' : ''}`}
                onClick={() => setSyntaxOpen(!syntaxOpen)}
              >
                <BookOpen size={16} />
                Русский язык
                <ChevronDown size={13} />
              </button>
              <button
                className="board-action pen-action"
                onClick={() => handle.current?.setPen(false)}
              >
                <PenLine size={16} />
                Ручка
              </button>
              <button
                className="board-action pen-action"
                onClick={() => handle.current?.setPen(true)}
              >
                <Highlighter size={16} />
                Маркер
              </button>
            </>
          )}
        </div>
        <div className="button-row">
          <button
            className="board-action"
            onClick={async () => {
              try {
                setAssets(await api(`/boards/${board.id}/files`));
                setFilesOpen(true);
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            <FolderIcon />
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
      {saveError && (
        <div className="board-warning" role="alert">
          {saveError}
          <button onClick={() => handle.current?.flush()}>Повторить сохранение</button>
        </div>
      )}
      {conflict && (
        <div className="board-warning" role="alert">
          Другой участник изменил тот же объект. Серверная версия сохранена; ваш вариант можно
          скачать.
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
        {pagesOpen && (
          <>
            <div className="pages-scrim" onClick={() => setPagesOpen(false)} />
            <aside className="pages-sidebar">
              <div className="pages-heading">
                <strong>Страницы</strong>
                <button
                  className="icon-btn"
                  aria-label="Скрыть страницы"
                  onClick={() => setPagesOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="page-thumbnails">
                {board.pages?.map((p, i) => (
                  <div key={p.id} className={`page-thumb ${pageId === p.id ? 'active' : ''}`}>
                    <button className="page-thumb-open" onClick={() => selectPage(p.id)}>
                      <div className="page-miniature">
                        <FileText size={28} />
                        <span>{i + 1}</span>
                      </div>
                      <strong>{p.title}</strong>
                    </button>
                    {user.role === 'teacher' && !readOnly && (
                      <div className="page-thumb-tools">
                        <button
                          aria-label={`Переименовать ${p.title}`}
                          onClick={() => setRename({ type: 'page', id: p.id, title: p.title })}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          disabled={i === 0}
                          aria-label="Поднять страницу"
                          onClick={async () => {
                            try {
                              await api(
                                `/pages/${p.id}`,
                                { position: board.pages![i - 1].position },
                                'PATCH',
                              );
                              await api(
                                `/pages/${board.pages![i - 1].id}`,
                                { position: p.position },
                                'PATCH',
                              );
                              await load();
                            } catch (e) {
                              toast((e as Error).message);
                            }
                          }}
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          disabled={(board.pages?.length || 0) < 2}
                          aria-label={`Удалить ${p.title}`}
                          onClick={() => setDeletePage(p)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {user.role === 'teacher' && !readOnly && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await handle.current?.flush();
                      if (save === 'offline' || save === 'error') return;
                      const p = await api<Page>(`/boards/${board.id}/pages`, {
                        title: `Страница ${(board.pages?.length || 0) + 1}`,
                      });
                      await load();
                      setPageId(p.id);
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  <Plus size={16} />
                  Страница
                </Button>
              )}
            </aside>
          </>
        )}
        <div className="canvas-shell">
          {pageId && (
            <PageEditor
              key={pageId}
              board={board}
              pageId={pageId}
              readOnly={readOnly}
              handleRef={handle}
              onSave={(state, error) => {
                setSave(state);
                setSaveError(error || '');
              }}
              onPeers={setPeers}
              onConflict={setConflict}
              onPages={load}
            />
          )}{' '}
          {syntaxOpen && !readOnly && (
            <div className="syntax-panel">
              <div className="syntax-head">
                <strong>Разбор предложения</strong>
                <button
                  className="icon-btn"
                  aria-label="Закрыть инструменты русского языка"
                  onClick={() => setSyntaxOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="syntax-lines">
                {[
                  ['single', 'Подлежащее'],
                  ['double', 'Сказуемое'],
                  ['wave', 'Определение'],
                  ['dash', 'Дополнение'],
                  ['dashdot', 'Обстоятельство'],
                ].map(([kind, name]) => (
                  <button key={kind} onClick={() => handle.current?.addSyntax(kind)}>
                    <LineSample kind={kind} />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
              <div className="syntax-templates">
                <strong>Быстрый старт</strong>
                <Button variant="secondary" onClick={() => handle.current?.addTemplate('text')}>
                  Большой текст
                </Button>
                <Button variant="secondary" onClick={() => handle.current?.addTemplate('oge')}>
                  Задание ОГЭ / ЕГЭ
                </Button>
                <Button variant="secondary" onClick={() => handle.current?.addTemplate('comment')}>
                  Комментарий к ответу
                </Button>
              </div>
              <p>
                Добавьте линию и расположите её под нужным словом. Для орфограмм используйте маркер.
              </p>
            </div>
          )}
        </div>
      </div>
      <input
        type="file"
        ref={fileInput}
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
            <small>Можно продолжить после завершения импорта</small>
          </div>
        </div>
      )}
      {rename && (
        <Rename
          title={rename.title}
          onClose={() => setRename(null)}
          onSave={async (title) => {
            await api(
              rename.type === 'board' ? `/boards/${rename.id}` : `/pages/${rename.id}`,
              { title },
              'PATCH',
            );
            await load();
          }}
        />
      )}
      {inviteOpen && <BoardInvites boardId={board.id} onClose={() => setInviteOpen(false)} />}
      {exportOpen && (
        <Modal title="Экспорт страницы" onClose={() => setExportOpen(false)}>
          <p className="muted">
            Экспортируется открытая страница вместе с пометками. Формат сцены можно снова загрузить
            через меню редактора.
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
      {historyOpen && (
        <BoardHistory
          pageId={pageId}
          revision={() => handle.current?.revision() || 0}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {deletePage && (
        <Confirm
          title="Удалить страницу?"
          text={`Страница «${deletePage.title}» и её история будут удалены. Сначала экспортируйте нужные материалы.`}
          onClose={() => setDeletePage(null)}
          onConfirm={async () => {
            await api(`/pages/${deletePage.id}`, undefined, 'DELETE');
            await load();
          }}
        />
      )}
      {filesOpen && (
        <Modal title="Исходные материалы доски" onClose={() => setFilesOpen(false)}>
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
        <Modal title="Доска для хорошего урока" onClose={() => setHelp(false)}>
          <p>
            Основные инструменты находятся над рабочим полем: выделение, ручка, текст, линии, фигуры
            и ластик. Цвет, толщину и прозрачность можно изменить в свойствах выбранного
            инструмента.
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
          <p>
            Для маркера выберите ручку, увеличьте толщину и уменьшите непрозрачность. В разделе
            «Русский язык» — линии для синтаксического разбора. PDF добавляются кнопкой «Загрузить».
          </p>
          <p className="muted">
            «Сохранено» появляется после ответа сервера. При потере связи дождитесь отправки
            локальных правок перед закрытием браузера.
          </p>
        </Modal>
      )}
    </div>
  );
}
function FolderIcon() {
  return <Layers size={16} />;
}
function LineSample({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 80 18" aria-hidden="true">
      {kind === 'wave' ? (
        <path d="M0 9q5-8 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0" />
      ) : (
        <>
          <path
            d="M0 7h80"
            strokeDasharray={kind === 'dash' ? '8 5' : kind === 'dashdot' ? '12 4 2 4' : undefined}
          />
          {kind === 'double' && <path d="M0 13h80" />}
        </>
      )}
    </svg>
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
}: {
  board: Board;
  pageId: string;
  readOnly: boolean;
  handleRef: React.MutableRefObject<EditorHandle | null>;
  onSave: (state: SaveState, error?: string) => void;
  onPeers: (p: any[]) => void;
  onConflict: (data: { elements: any[]; files: any }) => void;
  onPages: () => Promise<void>;
}) {
  const { user, toast } = useApp();
  const [initial, setInitial] = useState<any>(null),
    [error, setError] = useState(''),
    [editor, setEditor] = useState<ExcalidrawImperativeAPI | null>(null);
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
        if (!mounted.current) return;
        setInitial({
          elements: restoreElements(scene, null),
          appState: {
            viewBackgroundColor: '#ffffff',
            currentItemFontFamily: 2,
            currentItemStrokeColor: '#252846',
            currentItemRoughness: 0,
            gridSize: null,
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
    editor?.updateScene({
      elements: restoreElements(current.current, null),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
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
        if (e.type === 'image' && !e.isDeleted && !knownFiles.current.has(e.fileId)) {
          const f = fileData.current[e.fileId as keyof BinaryFiles];
          if (!f) throw new Error('Изображение ещё загружается');
          const blob = await (await fetch(f.dataURL)).blob();
          await upload(blob, {
            boardId: board.id,
            excalidrawId: e.fileId,
            name: 'Изображение доски.png',
          });
          knownFiles.current.add(e.fileId);
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
      editor?.updateScene({
        elements: restoreElements(current.current, null),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
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
    ready.current = true;
    void flush();
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
      addSyntax(kind) {
        const { x, y } = center();
        const base = { type: 'line', x, y, strokeColor: '#4d48c8', strokeWidth: 2, roughness: 0 };
        if (kind === 'double')
          add([
            {
              ...base,
              points: [
                [0, 0],
                [180, 0],
              ],
            },
            {
              ...base,
              y: y + 6,
              points: [
                [0, 0],
                [180, 0],
              ],
            },
          ]);
        else if (kind === 'wave')
          add([
            {
              ...base,
              points: Array.from({ length: 37 }, (_, i) => [
                i * 5,
                Math.sin((i * Math.PI) / 3) * 4,
              ]),
            },
          ]);
        else if (kind === 'dashdot') {
          add(
            Array.from({ length: 10 }, (_, i) => ({
              ...base,
              x: x + i * 18,
              points: [
                [0, 0],
                [i % 2 ? 2 : 12, 0],
              ],
            })),
          );
        } else
          add([
            {
              ...base,
              points: [
                [0, 0],
                [180, 0],
              ],
              strokeStyle: kind === 'dash' ? 'dashed' : 'solid',
            },
          ]);
      },
      addTemplate(kind) {
        const { x, y } = center();
        const text =
          kind === 'oge'
            ? 'Задание ОГЭ / ЕГЭ\n\nВставьте полный текст задания.\n\nОбъяснение выбора:\n\nОтвет:'
            : kind === 'comment'
              ? 'Комментарий преподавателя\n\nЧто получилось:\n\nЧто повторить:'
              : 'Текст для разбора\n\nВставьте сюда предложение или абзац.\nДвойной щелчок — редактировать текст.';
        add([
          {
            type: 'text',
            x,
            y,
            text,
            fontFamily: 2,
            fontSize: kind === 'comment' ? 20 : 24,
            strokeColor: kind === 'comment' ? '#2a8b69' : '#252846',
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
          download(
            new Blob(
              [
                JSON.stringify(
                  {
                    type: 'excalidraw',
                    version: 2,
                    source: 'osnova',
                    elements,
                    appState: { viewBackgroundColor: appState.viewBackgroundColor },
                    files,
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
        if (!elements.length) throw new Error('На странице пока нет объектов для экспорта');
        const blob = await exportToBlob({
          elements,
          appState: { ...appState, exportBackground: true, exportWithDarkMode: false },
          files,
          mimeType: 'image/png',
          exportPadding: 24,
        });
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
          changeViewBackgroundColor: true,
          toggleTheme: false,
        },
      }}
      onChange={(elements, _state, files) => {
        if (!ready.current) return;
        const next = new Map<string, any>(elements.map((e) => [e.id, e]));
        if (!readOnly)
          for (const e of base.current.values())
            if (!next.has(e.id))
              next.set(e.id, {
                ...e,
                isDeleted: true,
                version: e.version + 1,
                versionNonce: Math.floor(Math.random() * 2 ** 30),
                updated: Date.now(),
              });
        current.current = [...next.values()];
        fileData.current = files;
        if (readOnly) return;
        const dirty = diff();
        if (!dirty.length) return;
        onSave(navigator.onLine ? 'saving' : 'offline');
        void persist();
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 450);
      }}
      onPointerUpdate={(payload) =>
        socketRef.current?.emit('cursor', { x: payload.pointer.x, y: payload.pointer.y })
      }
    >
      <MainMenu>
        {!readOnly && <MainMenu.DefaultItems.LoadScene />}
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
      <WelcomeScreen>
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Logo>
            <span className="canvas-welcome-logo">
              основа<span>.</span>
            </span>
          </WelcomeScreen.Center.Logo>
          <WelcomeScreen.Center.Heading>Каждый урок — новое открытие</WelcomeScreen.Center.Heading>
          <div className="canvas-welcome-text">
            Начните с текста, рисунка или загрузите рабочий лист.
            <br />
            Всё сохранится в вашем пространстве.
          </div>
        </WelcomeScreen.Center>
      </WelcomeScreen>
    </Excalidraw>
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
        text="Текущая страница попадёт в историю. Участники увидят восстановленную версию."
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
    <Modal title="История страницы" onClose={onClose}>
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
