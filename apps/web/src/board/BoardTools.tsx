import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  Eraser,
  Hand,
  Highlighter,
  LockKeyhole,
  MousePointer2,
  Palette,
  Pencil,
  Redo2,
  Shapes,
  Sigma,
  StickyNote,
  Type,
  Undo2,
  UnlockKeyhole,
  Upload,
  X,
  Spline,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  MoreHorizontal,
  Copy,
  Layers,
  Trash2,
  Pin,
  PinOff,
  Image as ImageIcon,
} from 'lucide-react';
import type { BoardToolState, EditorHandle } from '../pages/BoardRoom';
import {
  figures,
  fonts,
  fontSizes,
  formulas,
  formulaSubjects,
  inkColors,
  lineKinds,
  mathSymbols,
  noteColors,
  type FigureKind,
  pictureStickers,
  penSizes,
  markerSizes,
} from './catalog';
import { figureParts, lineParts } from './geometry';
import ColorPicker from './ColorPicker';
import { textFonts, textFamily, type TextModel } from './richText';

export function VectorPreview({
  parts,
  padding = 10,
  strokeWidth = 2,
}: {
  parts: any[];
  padding?: number;
  strokeWidth?: number;
}) {
  const points = parts.flatMap((p) => [
    [p.x, p.y],
    [p.x + (p.width || 0), p.y + (p.height || 0)],
  ]);
  const x = Math.min(...points.map((p) => p[0])),
    y = Math.min(...points.map((p) => p[1])),
    w = Math.max(...points.map((p) => p[0])) - x || 1,
    h = Math.max(...points.map((p) => p[1])) - y || 1;
  return (
    <svg
      viewBox={`${x - padding} ${y - padding} ${w + padding * 2} ${h + padding * 2}`}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {parts.map((p, i) =>
        p.type === 'text' ? null : p.type === 'ellipse' ? (
          <ellipse
            key={i}
            cx={p.x + p.width / 2}
            cy={p.y + p.height / 2}
            rx={p.width / 2}
            ry={p.height / 2}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={p.strokeStyle === 'dashed' ? '5 4' : undefined}
          />
        ) : p.type === 'rectangle' || p.type === 'diamond' ? (
          p.type === 'diamond' ? (
            <polygon
              key={i}
              points={`${p.x + p.width / 2},${p.y} ${p.x + p.width},${p.y + p.height / 2} ${p.x + p.width / 2},${p.y + p.height} ${p.x},${p.y + p.height / 2}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <rect
              key={i}
              x={p.x}
              y={p.y}
              width={p.width}
              height={p.height}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          )
        ) : (
          <polyline
            key={i}
            points={p.points?.map(([px, py]: number[]) => `${p.x + px},${p.y + py}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={
              p.strokeStyle === 'dashed' ? '6 4' : p.strokeStyle === 'dotted' ? '1 4' : undefined
            }
          />
        ),
      )}
    </svg>
  );
}
type Panel = 'pen' | 'marker' | 'shapes' | 'lines' | 'stickers' | 'formulas' | null;
type ColorTarget = 'stroke' | 'fill' | 'note' | 'text';
export default function BoardTools({
  editor,
  tool,
  ready,
  upload,
}: {
  editor: MutableRefObject<EditorHandle | null>;
  tool: BoardToolState;
  ready: boolean;
  upload: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null),
    [space, setSpace] = useState(false),
    [stickersTab, setStickersTab] = useState<'note' | 'pictures'>('note'),
    [picker, setPicker] = useState<ColorTarget | null>(null),
    [objectMenu, setObjectMenu] = useState(false),
    [subject, setSubject] = useState<string>('Математика'),
    [formula, setFormula] = useState(formulas[0].text),
    [formulaName, setFormulaName] = useState(formulas[0].name),
    [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const selection = tool.selection,
    disabled = !ready || tool.readOnly,
    locked = !!selection?.locked,
    model = tool.textStyle,
    bounds = selection?.bounds,
    color = selection?.color || tool.color,
    opacity = tool.opacity ?? 100;
  useEffect(() => {
    setObjectMenu(!!selection?.count && !selection.textCount);
    if (selection?.count) {
      setPanel(null);
      setPicker(null);
    }
  }, [selection?.ids.join('|')]);
  useEffect(() => {
    if (!panel && !picker && !objectMenu) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null);
        setPicker(null);
        setObjectMenu(false);
        e.stopPropagation();
      }
    };
    const outside = (e: PointerEvent) => {
      if (
        !(e.target as HTMLElement).closest(
          '.board-tool-popover,.lesson-drawing-tools,.board-object-properties,.board-text-toolbar,.board-selection-actions',
        )
      ) {
        setPanel(null);
        setPicker(null);
        setObjectMenu(false);
      }
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [panel, picker, objectMenu]);
  const run = (fn: () => unknown, close = true) => {
    if (disabled) return;
    setError('');
    try {
      Promise.resolve(fn()).catch((e) => setError((e as Error).message));
      if (close) {
        setPanel(null);
        setPicker(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const open = (p: Panel) => {
    setObjectMenu(false);
    setPicker(null);
    setError('');
    setPanel((old) => (old === p ? null : p));
  };
  const style = (patch: Parameters<EditorHandle['setTextStyle']>[0]) =>
    run(() => editor.current?.setTextStyle(patch), false);
  const button = (label: string, Icon: any, action: () => void, active = false) => (
    <button
      type="button"
      key={label}
      className={`lesson-tool ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={action}
    >
      <Icon size={23} />
    </button>
  );
  const palette = (target: ColorTarget = 'stroke', current = color, transparent = false) => (
    <div className="board-palette">
      {transparent && (
        <button
          className={`board-color-clear ${current === 'transparent' ? 'active' : ''}`}
          aria-label="Без заливки"
          onClick={() => editor.current?.setFill('transparent')}
        >
          ∅
        </button>
      )}
      {inkColors.map((c, i) => (
        <button
          key={c}
          className={`board-color-dot ${current === c ? 'active' : ''}`}
          style={{ background: c }}
          aria-label={['Фиолетовый', 'Графитовый', 'Зелёный', 'Оранжевый', 'Лавандовый'][i]}
          disabled={locked}
          onClick={() => {
            if (target === 'fill' || target === 'note') editor.current?.setFill(c);
            else if (target === 'text') style({ color: c });
            else editor.current?.setColor(c);
          }}
        />
      ))}
      <button
        className="board-any-color-button"
        aria-label="Любой цвет"
        disabled={locked}
        onClick={() => setPicker(target)}
      >
        <span /> <small>Любой цвет</small>
      </button>
    </div>
  );
  const thickness = (marker = false) => {
    const spec = marker ? markerSizes : penSizes;
    return (
      <label className="board-setting-row">
        Толщина
        <div>
          <input
            type="range"
            aria-label={marker ? 'Толщина маркера' : 'Толщина пера'}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={tool.width}
            disabled={locked}
            onChange={(e) => editor.current?.setWidth(Number(e.target.value))}
          />
          <output>{Number(tool.width.toFixed(2))} px</output>
        </div>
      </label>
    );
  };
  const opacityControl = (
    <label className="board-setting-row">
      Прозрачность
      <div>
        <input
          type="range"
          aria-label="Прозрачность инструмента"
          min={5}
          max={100}
          step={5}
          value={opacity}
          disabled={locked}
          onChange={(e) => editor.current?.setOpacity(Number(e.target.value))}
        />
        <output>{opacity}%</output>
      </div>
    </label>
  );
  const actionMenu = (
    <div className="board-object-menu" role="menu" aria-label="Действия с объектом">
      <button
        role="menuitem"
        className="board-menu-pin"
        onClick={() => {
          run(() => editor.current?.lockSelection(), false);
          setObjectMenu(false);
        }}
      >
        {locked ? <PinOff /> : <Pin />}
        {locked ? 'Открепить' : 'Закрепить'}
      </button>
      <button
        role="menuitem"
        onClick={() => {
          run(() => editor.current?.objectAction('duplicate'));
          setObjectMenu(false);
        }}
      >
        <Copy />
        Дублировать
      </button>
      <hr />
      <button
        role="menuitem"
        onClick={() => {
          run(() => editor.current?.objectAction('front'));
          setObjectMenu(false);
        }}
      >
        <Layers />
        На передний план
      </button>
      <button
        role="menuitem"
        onClick={() => {
          run(() => editor.current?.objectAction('back'));
          setObjectMenu(false);
        }}
      >
        <Layers />
        На задний план
      </button>
      <hr />
      <button
        role="menuitem"
        className="board-menu-delete"
        onClick={() => {
          run(() => editor.current?.objectAction('delete'));
          setObjectMenu(false);
        }}
      >
        <Trash2 />
        Удалить
      </button>
    </div>
  );
  return (
    <>
      <div className="lesson-drawing-tools" role="toolbar" aria-label="Инструменты доски">
        {button(
          'Выделение',
          MousePointer2,
          () => run(() => editor.current?.setTool('selection')),
          tool.type === 'selection',
        )}
        {button(
          'Перемещение холста',
          Hand,
          () => run(() => editor.current?.setTool('hand')),
          tool.type === 'hand',
        )}
        {button(
          'Ручка',
          Pencil,
          () => {
            editor.current?.setTool('pen');
            open('pen');
          },
          tool.type === 'pen',
        )}
        {button(
          'Маркер',
          Highlighter,
          () => {
            editor.current?.setTool('marker');
            open('marker');
          },
          tool.type === 'marker',
        )}
        {button(
          'Ластик',
          Eraser,
          () => run(() => editor.current?.setTool('eraser')),
          tool.type === 'eraser',
        )}
        {button(
          'Текст',
          Type,
          () => run(() => editor.current?.setTool('text')),
          tool.type === 'text',
        )}
        {button(
          'Линии',
          Spline,
          () => open('lines'),
          panel === 'lines' || tool.type === 'line' || tool.type === 'arrow',
        )}
        {button(
          'Фигуры',
          Shapes,
          () => open('shapes'),
          panel === 'shapes' || tool.type === 'figure',
        )}
        {button('Стикеры', StickyNote, () => open('stickers'), panel === 'stickers')}
        {button('Формулы', Sigma, () => open('formulas'), panel === 'formulas')}
        {button('Загрузить PDF или изображение', Upload, upload)}
        <span className="lesson-tool-divider" />
        {button('Отменить действие', Undo2, () => editor.current?.undo())}
        {button('Повторить действие', Redo2, () => editor.current?.undo(true))}
      </div>
      {!!selection?.count && !tool.readOnly && (
        <div
          className="board-selection-actions"
          style={{ left: bounds?.menuX ?? 110, top: bounds?.menuY ?? 90 }}
        >
          <button
            className="board-selection-pin"
            aria-label={locked ? 'Открепить выделенное' : 'Закрепить выделенное'}
            title={locked ? 'Открепить' : 'Закрепить'}
            onClick={() => editor.current?.lockSelection()}
          >
            {locked ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}
          </button>
          {!selection.textCount && (
            <button
              className="board-object-more"
              aria-label="Действия с объектом"
              onClick={() => setObjectMenu((v) => !v)}
            >
              <MoreHorizontal size={21} />
            </button>
          )}
          {objectMenu && actionMenu}
        </div>
      )}
      {!!selection?.textCount && model && !tool.readOnly && (
        <div
          className="board-text-toolbar"
          role="toolbar"
          aria-label="Форматирование текста"
          style={{ left: bounds?.toolbarX ?? 110, top: bounds?.toolbarY ?? 70 }}
        >
          <select
            aria-label="Шрифт текста"
            disabled={locked}
            value={model.family}
            onChange={(e) => style({ fontFamily: e.target.value })}
          >
            {!textFonts.some((f) => f.id === model.family) && (
              <option value={model.family}>{textFamily(model.family)}</option>
            )}
            {textFonts.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Размер текста"
            value={Math.round(model.fontSize)}
            disabled={locked}
            onChange={(e) => style({ fontSize: Number(e.target.value) })}
          >
            {!fontSizes.includes(Math.round(model.fontSize)) && (
              <option value={Math.round(model.fontSize)}>{Math.round(model.fontSize)}</option>
            )}
            {fontSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <i />
          {[
            [Bold, 'Жирный', 'bold'],
            [Italic, 'Курсив', 'italic'],
            [Underline, 'Подчёркнутый', 'underline'],
          ].map(([Icon, label, key]: any) => (
            <button
              key={key}
              aria-label={label}
              aria-pressed={!!model[key as keyof TextModel]}
              disabled={locked}
              onClick={() => style({ [key]: !model[key as keyof TextModel] })}
            >
              <Icon size={19} />
            </button>
          ))}
          <i />
          {[
            [AlignLeft, 'По левому краю', 'left'],
            [AlignCenter, 'По центру', 'center'],
            [AlignRight, 'По правому краю', 'right'],
          ].map(([Icon, label, align]: any) => (
            <button
              key={align}
              aria-label={label}
              aria-pressed={model.align === align}
              disabled={locked}
              onClick={() => style({ textAlign: align })}
            >
              <Icon size={18} />
            </button>
          ))}
          <button
            className="board-text-color"
            aria-label="Цвет текста"
            style={{ '--text-ink': model.color } as React.CSSProperties}
            disabled={locked}
            onClick={() => {
              setPanel(null);
              setPicker('text');
            }}
          >
            <Palette size={18} />
          </button>
          <button
            aria-label="Изменить текст"
            disabled={locked}
            onClick={() => editor.current?.editText()}
          >
            <Pencil size={17} />
          </button>
          <button
            aria-label="Действия с объектом"
            aria-expanded={objectMenu}
            onClick={() => setObjectMenu((v) => !v)}
          >
            <MoreHorizontal size={21} />
          </button>
        </div>
      )}
      {(panel || picker) && (
        <div className="board-tool-popover" ref={panelRef}>
          {picker ? (
            <ColorPicker
              color={
                picker === 'text'
                  ? model?.color || color
                  : picker === 'fill' || picker === 'note'
                    ? selection?.fill || tool.fill || '#fff0a8'
                    : color
              }
              opacity={opacity}
              onClose={() => setPicker(null)}
              onApply={(hex, alpha) => {
                if (picker === 'note' && !selection?.isNote) {
                  run(() => editor.current?.addSticker('note', hex, ''));
                } else if (picker === 'fill' || picker === 'note') editor.current?.setFill(hex);
                else if (picker === 'text') style({ color: hex });
                else editor.current?.setColor(hex);
                editor.current?.setOpacity(alpha);
                setPicker(null);
              }}
            />
          ) : (
            <div
              className={`board-tool-panel panel-${panel}`}
              role="dialog"
              aria-label={
                {
                  pen: 'Настройки ручки',
                  marker: 'Настройки маркера',
                  shapes: 'Галерея фигур',
                  lines: 'Виды линий',
                  stickers: 'Стикеры',
                  formulas: 'Готовые формулы',
                }[panel!]
              }
            >
              <div className="board-panel-head">
                <h2>
                  {
                    {
                      pen: 'Настройки ручки',
                      marker: 'Настройки маркера',
                      shapes: 'Галерея фигур',
                      lines: 'Виды линий',
                      stickers: 'Стикеры',
                      formulas: 'Готовые формулы',
                    }[panel!]
                  }
                </h2>
                <button
                  type="button"
                  aria-label="Закрыть настройки инструмента"
                  onClick={() => setPanel(null)}
                >
                  <X size={20} />
                </button>
              </div>
              {(panel === 'pen' || panel === 'marker') && (
                <>
                  <label className="board-panel-label">Цвет</label>
                  {palette()}
                  <hr />
                  {thickness(panel === 'marker')}
                  <div className="board-ink-preview">
                    {panel === 'pen' ? (
                      <svg viewBox="0 0 320 42">
                        <path
                          d="M10 27 C50 0 70 42 110 23 S165 28 200 18 S250 36 310 12"
                          fill="none"
                          stroke={color}
                          strokeWidth={tool.width}
                          strokeLinecap="round"
                          opacity={opacity / 100}
                        />
                      </svg>
                    ) : (
                      <span
                        style={{ background: color, opacity: opacity / 100, height: tool.width }}
                      >
                        Выделенный текст
                      </span>
                    )}
                  </div>
                  <hr />
                  {opacityControl}
                </>
              )}
              {panel === 'lines' && (
                <>
                  {palette()}
                  {thickness()}
                  <div className="board-line-list">
                    {lineKinds.map((line) => (
                      <button
                        key={line.id}
                        aria-label={`${line.name} — ${line.hint}`}
                        className={tool.lineKind === line.id ? 'active' : ''}
                        onClick={() => run(() => editor.current?.setLineKind(line.id))}
                      >
                        <VectorPreview parts={lineParts(line.id, 160)} />
                        <span>{line.name}</span>
                      </button>
                    ))}
                    <button
                      aria-label="Стрелка"
                      onClick={() => run(() => editor.current?.setTool('arrow'))}
                    >
                      <ArrowUpRight size={28} />
                      <span>Стрелка</span>
                    </button>
                  </div>
                </>
              )}
              {panel === 'shapes' && (
                <>
                  <div className="board-panel-tabs">
                    <button className={!space ? 'active' : ''} onClick={() => setSpace(false)}>
                      2D
                    </button>
                    <button className={space ? 'active' : ''} onClick={() => setSpace(true)}>
                      3D
                    </button>
                  </div>
                  <div className="board-figure-grid">
                    {figures
                      .filter((f) => f.space === space)
                      .map((f) => (
                        <button
                          key={f.id}
                          aria-label={`Фигура: ${f.name}`}
                          className={tool.figureKind === f.id ? 'active' : ''}
                          onClick={() => run(() => editor.current?.setFigureKind(f.id))}
                        >
                          <VectorPreview
                            parts={figureParts({ kind: f.id, width: 120, height: 100, depth: 40 })}
                          />
                          <span>{f.name}</span>
                        </button>
                      ))}
                  </div>
                  <div className="board-shape-colors">
                    <section>
                      <strong>Заливка</strong>
                      {palette('fill', selection?.fill || tool.fill || 'transparent', true)}
                    </section>
                    <section>
                      <strong>Контур</strong>
                      {palette()}
                    </section>
                  </div>
                  {!!selection?.figure && (
                    <button
                      className="board-panel-link"
                      disabled={locked}
                      onClick={() => run(() => editor.current?.ungroup())}
                    >
                      Разгруппировать фигуру
                    </button>
                  )}
                </>
              )}
              {panel === 'stickers' && (
                <>
                  <div className="board-panel-tabs">
                    <button
                      className={stickersTab === 'note' ? 'active' : ''}
                      onClick={() => setStickersTab('note')}
                    >
                      Заметка
                    </button>
                    <button
                      className={stickersTab === 'pictures' ? 'active' : ''}
                      onClick={() => setStickersTab('pictures')}
                    >
                      Стикеры Эда
                    </button>
                  </div>
                  {stickersTab === 'note' ? (
                    <>
                      <div className="board-note-grid">
                        {noteColors.map(([c, name]) => (
                          <button
                            key={c}
                            style={{ background: c }}
                            aria-label={`${name} стикер`}
                            onClick={() =>
                              run(() =>
                                selection?.isNote
                                  ? editor.current?.setFill(c)
                                  : editor.current?.addSticker('note', c, ''),
                              )
                            }
                          >
                            <span>
                              Ваша
                              <br />
                              заметка
                            </span>
                          </button>
                        ))}
                        <button
                          className="board-note-custom"
                          aria-label="Другой цвет стикера"
                          onClick={() => setPicker('note')}
                        >
                          <Palette />
                          <span>Другой цвет</span>
                        </button>
                      </div>
                      <p className="board-panel-hint">
                        Выберите цвет листочка. Двойной щелчок по заметке — написать текст.
                      </p>
                    </>
                  ) : (
                    <div className="board-picture-stickers">
                      {pictureStickers.map((item) => (
                        <button
                          key={item.id}
                          aria-label={`Стикер: ${item.name}`}
                          onClick={() => run(() => editor.current?.addPictureSticker(item.id))}
                        >
                          <img src={item.src} alt={item.name} loading="lazy" />
                          <span>{item.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {panel === 'formulas' && (
                <>
                  <div className="board-panel-tabs">
                    {formulaSubjects.map((s) => (
                      <button
                        key={s}
                        className={subject === s ? 'active' : ''}
                        onClick={() => {
                          setSubject(s);
                          const f = formulas.find((f) => f.subject === s)!;
                          setFormula(f.text);
                          setFormulaName(f.name);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <label className="board-panel-label">
                    Шаблон
                    <select
                      aria-label="Шаблон формулы"
                      value={formulaName}
                      onChange={(e) => {
                        const f = formulas.find((f) => f.name === e.target.value)!;
                        setFormula(f.text);
                        setFormulaName(f.name);
                      }}
                    >
                      {formulas
                        .filter((f) => f.subject === subject)
                        .map((f) => (
                          <option key={f.name}>{f.name}</option>
                        ))}
                    </select>
                  </label>
                  <textarea
                    aria-label="Текст формулы"
                    value={formula}
                    rows={5}
                    onChange={(e) => setFormula(e.target.value)}
                    maxLength={2000}
                  />
                  <div className="board-math-symbols">
                    {mathSymbols.map((s) => (
                      <button
                        key={s}
                        aria-label={`Символ ${s}`}
                        onClick={() => setFormula((t) => t + s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn btn-primary board-panel-submit"
                    disabled={!formula.trim()}
                    onClick={() => run(() => editor.current?.addFormula(formula, formulaName))}
                  >
                    Добавить формулу
                  </button>
                </>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="board-tool-error">
              {error}
            </p>
          )}
        </div>
      )}
      {error && !panel && !picker && (
        <div className="board-tool-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
