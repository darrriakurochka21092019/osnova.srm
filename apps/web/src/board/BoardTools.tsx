import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  ArrowUpRight,
  Box,
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
  type FigureSpec,
} from './catalog';
import { figureParts, lineParts } from './geometry';

function VectorPreview({ parts }: { parts: any[] }) {
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
      viewBox={`${x - 10} ${y - 10} ${w + 20} ${h + 20}`}
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
            strokeWidth="2"
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
              strokeWidth="2"
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
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )
        ) : (
          <polyline
            key={i}
            points={p.points?.map(([px, py]: number[]) => `${p.x + px},${p.y + py}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
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
const defaults: FigureSpec = { kind: 'rectangle', width: 180, height: 160, depth: 65 };
type Panel = 'shapes' | 'lines' | 'stickers' | 'formulas' | 'text' | 'locked' | null;
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
    [spec, setSpec] = useState<FigureSpec>(defaults),
    [noteColor, setNoteColor] = useState<string>(noteColors[0][0]),
    [noteText, setNoteText] = useState('Новая заметка'),
    [subject, setSubject] = useState<string>('Математика'),
    [formula, setFormula] = useState(formulas[0].text),
    [formulaName, setFormulaName] = useState(formulas[0].name),
    [text, setText] = useState(''),
    [hex, setHex] = useState(tool.color),
    [error, setError] = useState('');
  const formulaInput = useRef<HTMLTextAreaElement>(null),
    panelRef = useRef<HTMLDivElement>(null);
  const selection = tool.selection,
    disabled = !ready || tool.readOnly,
    locked = selection?.locked;
  useEffect(() => {
    setHex(tool.selection?.color || tool.color);
  }, [tool.color, tool.selection?.color]);
  useEffect(() => {
    setText(selection?.text || '');
  }, [selection?.ids.join('|'), selection?.text]);
  useEffect(() => {
    if (selection?.figure) {
      setSpec(selection.figure);
      setSpace(!!figures.find((f) => f.id === selection.figure!.kind)?.space);
    }
  }, [JSON.stringify(selection?.figure)]);
  useEffect(() => {
    if (!panel) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null);
        e.stopPropagation();
      }
    };
    const outside = (e: PointerEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('.lesson-drawing-tools,.board-object-properties')
      )
        setPanel(null);
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [panel]);
  const choose = (p: Panel) => {
    setError('');
    setPanel((old) => (old === p ? null : p));
  };
  const act = (fn: () => void) => {
    if (disabled) return;
    try {
      fn();
      setPanel(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const button = (
    id: string,
    label: string,
    Icon: any,
    fn: () => void,
    active = tool.type === id,
  ) => (
    <button
      key={id}
      type="button"
      className={`lesson-tool ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={fn}
    >
      <Icon size={23} />
    </button>
  );
  const changeColor = (color: string) => {
    setHex(color);
    if (/^#[\da-f]{6}$/i.test(color)) editor.current?.setColor(color);
  };
  const lockedItems = panel === 'locked' ? editor.current?.lockedObjects() || [] : [];
  return (
    <>
      <div className="lesson-drawing-tools" role="toolbar" aria-label="Инструменты доски">
        {button('selection', 'Выделение', MousePointer2, () =>
          act(() => editor.current?.setTool('selection')),
        )}
        {button('hand', 'Перемещение холста', Hand, () =>
          act(() => editor.current?.setTool('hand')),
        )}
        {button('pen', 'Ручка', Pencil, () => act(() => editor.current?.setTool('pen')))}
        {button('marker', 'Маркер', Highlighter, () =>
          act(() => editor.current?.setTool('marker')),
        )}
        {button('eraser', 'Ластик', Eraser, () => act(() => editor.current?.setTool('eraser')))}
        {button(
          'text',
          'Текст',
          Type,
          () => {
            if (!selection?.textCount) editor.current?.setTool('text');
            choose('text');
          },
          panel === 'text' || tool.type === 'text',
        )}
        {button('shapes', 'Фигуры', Shapes, () => choose('shapes'), panel === 'shapes')}
        {button(
          'lines',
          'Линии',
          Spline,
          () => choose('lines'),
          panel === 'lines' || tool.type === 'line',
        )}
        {button('arrow', 'Стрелка', ArrowUpRight, () =>
          act(() => editor.current?.setTool('arrow')),
        )}
        {button('stickers', 'Стикеры', StickyNote, () => choose('stickers'), panel === 'stickers')}
        {button('formulas', 'Формулы', Sigma, () => choose('formulas'), panel === 'formulas')}
        {button('upload', 'Загрузить PDF или изображение', Upload, upload)}
        <span className="lesson-tool-divider" />
        {button('undo', 'Отменить действие', Undo2, () => editor.current?.undo())}
        {button('redo', 'Повторить действие', Redo2, () => editor.current?.undo(true))}
      </div>
      <div
        className="lesson-color-tools board-ink-settings"
        role="toolbar"
        aria-label="Цвет и толщина"
      >
        <div className="board-quick-colors">
          {inkColors.map((color, i) => (
            <button
              key={color}
              type="button"
              className={`lesson-color ${(selection?.color || tool.color) === color ? 'active' : ''}`}
              style={{ '--ink-color': color } as React.CSSProperties}
              disabled={disabled || locked}
              aria-label={['Графитовый', 'Индиго', 'Мятный', 'Персиковый', 'Лавандовый'][i]}
              onClick={() => changeColor(color)}
            />
          ))}
        </div>
        <label className="board-any-color" title="Любой цвет">
          <Palette size={18} />
          <input
            type="color"
            aria-label="Любой цвет"
            disabled={disabled || locked}
            value={/^#[\da-f]{6}$/i.test(hex) ? hex : '#252846'}
            onChange={(e) => changeColor(e.target.value)}
          />
        </label>
        <input
          className="board-hex"
          aria-label="Цвет HEX"
          value={hex}
          maxLength={7}
          disabled={disabled || locked}
          onChange={(e) => changeColor(e.target.value)}
          onBlur={() => setHex(selection?.color || tool.color)}
        />
        <span className="board-ink-divider" />
        <label className="board-width-range">
          <span>Толщина</span>
          <input
            type="range"
            min="0.5"
            max="40"
            step="0.5"
            aria-label="Толщина пера"
            disabled={disabled || locked}
            value={tool.width}
            onChange={(e) => editor.current?.setWidth(Number(e.target.value))}
          />
          <output>{tool.width}</output>
        </label>
        <button
          className="board-locked-list"
          type="button"
          title="Закреплённые объекты"
          aria-label="Закреплённые объекты"
          disabled={disabled}
          onClick={() => choose('locked')}
        >
          <LockKeyhole size={17} />
          {!!tool.lockedCount && <small>{tool.lockedCount}</small>}
        </button>
      </div>
      {!!selection?.count && !tool.readOnly && (
        <div className="board-object-properties" role="toolbar" aria-label="Выделенный объект">
          {!!selection.textCount && (
            <>
              <select
                aria-label="Шрифт текста"
                disabled={locked}
                value={tool.fontFamily || 2}
                onChange={(e) =>
                  editor.current?.setTextStyle({ fontFamily: Number(e.target.value) })
                }
              >
                {fonts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Размер текста"
                disabled={locked}
                value={Math.round(tool.fontSize || 24)}
                onChange={(e) => editor.current?.setTextStyle({ fontSize: Number(e.target.value) })}
              >
                {![...fontSizes].includes(Math.round(tool.fontSize || 24)) && (
                  <option value={Math.round(tool.fontSize || 24)}>
                    {Math.round(tool.fontSize || 24)}
                  </option>
                )}
                {fontSizes.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button type="button" disabled={locked} onClick={() => choose('text')}>
                Изменить текст
              </button>
            </>
          )}
          {selection.figure && (
            <button type="button" disabled={locked} onClick={() => choose('shapes')}>
              <Box size={16} />
              Параметры фигуры
            </button>
          )}
          {selection.fill && selection.fill !== 'transparent' && (
            <label className="board-fill-color">
              Цвет стикера
              <input
                type="color"
                aria-label="Цвет выделенного стикера"
                disabled={locked}
                value={/^#[\da-f]{6}$/i.test(selection.fill) ? selection.fill : '#fff0a8'}
                onChange={(e) => editor.current?.setFill(e.target.value)}
              />
            </label>
          )}
          <button
            type="button"
            className={locked ? 'is-locked' : ''}
            aria-label={locked ? 'Открепить выделенное' : 'Закрепить выделенное'}
            onClick={() => editor.current?.lockSelection()}
          >
            {locked ? <UnlockKeyhole size={17} /> : <LockKeyhole size={17} />}
            <span>{locked ? 'Открепить' : 'Закрепить'}</span>
          </button>
        </div>
      )}
      {panel && (
        <div
          className={`board-tool-panel panel-${panel}`}
          ref={panelRef}
          role="dialog"
          aria-label={
            {
              shapes: 'Фигуры',
              lines: 'Варианты линий',
              stickers: 'Стикеры',
              formulas: 'Готовые формулы',
              text: 'Настройки текста',
              locked: 'Закреплённые объекты',
            }[panel]
          }
        >
          <div className="board-panel-head">
            <h2>
              {
                {
                  shapes: 'Фигуры',
                  lines: 'Линии и подчёркивания',
                  stickers: 'Стикеры',
                  formulas: 'Готовые формулы',
                  text: 'Текст',
                  locked: 'Закреплённые объекты',
                }[panel]
              }
            </h2>
            <button
              type="button"
              aria-label="Закрыть настройки инструмента"
              onClick={() => setPanel(null)}
            >
              <X size={18} />
            </button>
          </div>
          {panel === 'shapes' && (
            <>
              <div className="board-panel-tabs">
                <button
                  className={!space ? 'active' : ''}
                  onClick={() => {
                    setSpace(false);
                    setSpec({ ...spec, kind: 'rectangle' });
                  }}
                >
                  Плоские
                </button>
                <button
                  className={space ? 'active' : ''}
                  onClick={() => {
                    setSpace(true);
                    setSpec({ ...spec, kind: 'cube' });
                  }}
                >
                  Объёмные
                </button>
              </div>
              <div className="board-figure-grid">
                {figures
                  .filter((f) => f.space === space)
                  .map((f) => (
                    <button
                      key={f.id}
                      aria-label={`Фигура: ${f.name}`}
                      className={spec.kind === f.id ? 'active' : ''}
                      onClick={() => setSpec({ ...spec, kind: f.id })}
                    >
                      <VectorPreview
                        parts={figureParts({
                          ...spec,
                          kind: f.id,
                          width: 120,
                          height: 100,
                          depth: 40,
                        })}
                      />
                      <span>{f.name}</span>
                    </button>
                  ))}
              </div>
              <div className="board-figure-fields">
                {[
                  ['width', 'Ширина'],
                  ['height', 'Высота'],
                  ['depth', 'Глубина'],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={`${label} фигуры`}
                      type="number"
                      min={key === 'depth' ? 15 : 40}
                      max={key === 'depth' ? 400 : 1200}
                      value={
                        key === 'height' &&
                        ['square', 'circle', 'cube', 'sphere'].includes(spec.kind)
                          ? spec.width
                          : spec[key as 'width' | 'height' | 'depth']
                      }
                      disabled={
                        (key === 'height' &&
                          ['square', 'circle', 'cube', 'sphere'].includes(spec.kind)) ||
                        (key === 'depth' &&
                          (!figures.find((f) => f.id === spec.kind)?.space ||
                            spec.kind === 'sphere'))
                      }
                      onChange={(e) => setSpec({ ...spec, [key]: Number(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
              <button
                className="btn btn-primary board-panel-submit"
                disabled={disabled}
                onClick={() => act(() => editor.current?.addFigure(spec))}
              >
                Добавить фигуру
              </button>
              {selection?.figure && (
                <>
                  <button
                    className="btn btn-secondary board-panel-submit"
                    disabled={disabled || locked}
                    onClick={() => act(() => editor.current?.editFigure(spec))}
                  >
                    Применить к выделенной фигуре
                  </button>
                  <button
                    className="board-panel-link"
                    disabled={disabled || locked}
                    onClick={() => act(() => editor.current?.ungroup())}
                  >
                    Разгруппировать для изменения рёбер
                  </button>
                </>
              )}
              <p className="board-panel-hint">
                Фигура состоит из линий и форм. Её можно перемещать, растягивать и вращать; двойной
                щелчок открывает отдельные элементы.
              </p>
            </>
          )}
          {panel === 'lines' && (
            <>
              <div className="board-line-grid">
                {lineKinds.map((line) => (
                  <button
                    key={line.id}
                    aria-label={`${line.name} — ${line.hint}`}
                    onClick={() => act(() => editor.current?.setLineKind(line.id))}
                  >
                    <VectorPreview parts={lineParts(line.id, 160)} />
                    <strong>{line.name}</strong>
                    <small>{line.hint}</small>
                  </button>
                ))}
              </div>
              <p className="board-panel-hint">
                Выберите вариант и проведите линию по холсту. Цвет и толщину можно менять сверху.
              </p>
            </>
          )}
          {panel === 'stickers' && (
            <>
              <p className="board-panel-label">Цвет листочка</p>
              <div className="board-note-colors">
                {noteColors.map(([color, name]) => (
                  <button
                    key={color}
                    aria-label={`${name} стикер`}
                    className={color === noteColor ? 'active' : ''}
                    style={{ background: color }}
                    onClick={() => setNoteColor(color)}
                  />
                ))}
              </div>
              <label className="board-panel-label">
                Текст стикера
                <textarea
                  aria-label="Текст стикера"
                  value={noteText}
                  maxLength={2000}
                  rows={3}
                  onChange={(e) => setNoteText(e.target.value)}
                />
              </label>
              <div className="board-note-preview" style={{ background: noteColor }}>
                {noteText || 'Ваш текст'}
              </div>
              <button
                className="btn btn-primary board-panel-submit"
                onClick={() =>
                  act(() =>
                    editor.current?.addSticker('note', noteColor, noteText || 'Новая заметка'),
                  )
                }
              >
                Добавить стикер
              </button>
              <p className="board-panel-label">Отметки и настроение</p>
              <div className="board-badge-grid">
                {[
                  ['star', '★', 'Звезда'],
                  ['heart', '♡', 'Сердце'],
                  ['smile', '☺', 'Улыбка'],
                  ['medal', '☆', 'Награда'],
                  ['great', 'Отлично!', 'Отлично'],
                  ['question', 'Подумай', 'Подумай'],
                  ['check', 'Проверь', 'Проверь'],
                  ['idea', 'Идея!', 'Идея'],
                ].map(([kind, symbol, name]) => (
                  <button
                    key={kind}
                    aria-label={`Стикер: ${name}`}
                    onClick={() => act(() => editor.current?.addSticker(kind, noteColor))}
                  >
                    <span style={{ background: noteColor }}>{symbol}</span>
                    <small>{name}</small>
                  </button>
                ))}
              </div>
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
                      setFormulaName(f.name);
                      setFormula(f.text);
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
                    setFormulaName(f.name);
                    setFormula(f.text);
                  }}
                >
                  {!formulas
                    .filter((f) => f.subject === subject)
                    .some((f) => f.name === formulaName) && (
                    <option value={formulaName}>Выберите формулу</option>
                  )}
                  {formulas
                    .filter((f) => f.subject === subject)
                    .map((f) => (
                      <option key={f.name}>{f.name}</option>
                    ))}
                </select>
              </label>
              <label className="board-panel-label">
                Формула
                <textarea
                  ref={formulaInput}
                  aria-label="Текст формулы"
                  value={formula}
                  maxLength={2000}
                  rows={4}
                  onChange={(e) => setFormula(e.target.value)}
                />
              </label>
              <div className="board-math-symbols">
                {mathSymbols.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    aria-label={`Вставить символ ${symbol}`}
                    onClick={() => {
                      const el = formulaInput.current,
                        pos = el?.selectionStart ?? formula.length,
                        end = el?.selectionEnd ?? pos;
                      setFormula(formula.slice(0, pos) + symbol + formula.slice(end));
                      requestAnimationFrame(() => {
                        el?.focus();
                        el?.setSelectionRange(pos + symbol.length, pos + symbol.length);
                      });
                    }}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
              <div className="board-formula-preview">{formula}</div>
              <button
                className="btn btn-primary board-panel-submit"
                disabled={!formula.trim() || disabled}
                onClick={() => act(() => editor.current?.addFormula(formula, formulaName))}
              >
                Добавить формулу
              </button>
              <p className="board-panel-hint">
                Формула вставляется редактируемым текстом. Двойной щелчок по ней — изменить
                значения, индексы и обозначения.
              </p>
            </>
          )}
          {panel === 'text' && (
            <>
              <div className="board-text-fields">
                <label>
                  Шрифт
                  <select
                    aria-label="Шрифт для текста"
                    value={tool.fontFamily || 2}
                    onChange={(e) =>
                      editor.current?.setTextStyle({ fontFamily: Number(e.target.value) })
                    }
                  >
                    {fonts.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Размер
                  <select
                    aria-label="Размер шрифта"
                    value={Math.round(tool.fontSize || 24)}
                    onChange={(e) =>
                      editor.current?.setTextStyle({ fontSize: Number(e.target.value) })
                    }
                  >
                    {!fontSizes.includes(Math.round(tool.fontSize || 24)) && (
                      <option value={Math.round(tool.fontSize || 24)}>
                        {Math.round(tool.fontSize || 24)}
                      </option>
                    )}
                    {fontSizes.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
              {selection?.text !== undefined ? (
                <>
                  <label className="board-panel-label">
                    Содержимое
                    <textarea
                      aria-label="Содержимое текста"
                      value={text}
                      maxLength={2000}
                      rows={5}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </label>
                  <button
                    className="btn btn-primary board-panel-submit"
                    disabled={locked}
                    onClick={() => act(() => editor.current?.setTextStyle({ text }))}
                  >
                    Применить текст
                  </button>
                </>
              ) : (
                <p className="board-panel-hint">
                  Нажмите на холст, чтобы начать текстовый блок. Для редактирования существующего
                  текста выделите его.
                </p>
              )}
            </>
          )}
          {panel === 'locked' && (
            <div className="board-locked-objects">
              {lockedItems.length ? (
                lockedItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      editor.current?.selectObject(item.id);
                      setPanel(null);
                    }}
                  >
                    <LockKeyhole size={16} />
                    <span>{item.label}</span>
                    <ChevronDown size={15} />
                  </button>
                ))
              ) : (
                <p className="board-panel-hint">
                  Выделите текст или фигуру и нажмите замочек рядом с настройками.
                </p>
              )}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </>
  );
}
