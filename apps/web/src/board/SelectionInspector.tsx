import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  ArrowUpToLine,
  ArrowDownToLine,
  Trash2,
  Palette,
  X,
} from 'lucide-react';
import type { BoardToolState, EditorHandle } from '../pages/BoardRoom';
import type { MutableRefObject } from 'react';
import { inkColors, fontSizes, penSizes, markerSizes } from './catalog';
import { textFamily, textFonts, type TextModel } from './richText';
export type InspectorColor = 'stroke' | 'fill' | 'note' | 'text';
export default function SelectionInspector({
  editor,
  tool,
  onColor,
  onClose,
  run,
}: {
  editor: MutableRefObject<EditorHandle | null>;
  tool: BoardToolState;
  onColor: (target: InspectorColor) => void;
  onClose: () => void;
  run: (fn: () => unknown, close?: boolean) => void;
}) {
  const selection = tool.selection!,
    model = tool.textStyle,
    locked = selection.locked;
  const text = !!selection.textCount && !!model,
    image = selection.type === 'image' && !text && !selection.figure;
  const note = !!selection.isNote,
    fill =
      note ||
      !!selection.figure ||
      ['rectangle', 'ellipse', 'diamond'].includes(selection.type || '');
  const color = text ? model!.color : selection.color || tool.color;
  const style = (patch: Parameters<EditorHandle['setTextStyle']>[0]) =>
    run(() => editor.current?.setTextStyle(patch), false);
  const icon = (
    label: string,
    Icon: any,
    fn: () => unknown,
    disabled = false,
    pressed?: boolean,
  ) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={() => run(fn, false)}
    >
      <Icon size={17} />
    </button>
  );
  return (
    <aside
      style={{ left: tool.selection?.bounds?.inspectorX }}
      className="board-inspector"
      aria-label="Свойства объекта"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header>
        <strong>
          {note
            ? 'Заметка'
            : text
              ? 'Текст'
              : selection.figure
                ? 'Фигура'
                : image
                  ? 'Изображение'
                  : selection.type === 'freedraw'
                    ? 'Рисунок'
                    : 'Объект'}
        </strong>
        <button aria-label="Закрыть свойства объекта" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      {text && (
        <>
          <div className="board-inspector-font">
            <select
              aria-label="Шрифт текста"
              value={model!.family}
              disabled={locked}
              onChange={(e) => style({ fontFamily: e.target.value })}
            >
              {!textFonts.some((f) => f.id === model!.family) && (
                <option value={model!.family}>{textFamily(model!.family)}</option>
              )}
              {textFonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Размер текста"
              value={Math.round(model!.fontSize)}
              disabled={locked}
              onChange={(e) => style({ fontSize: Number(e.target.value) })}
            >
              {!fontSizes.includes(Math.round(model!.fontSize)) && (
                <option value={Math.round(model!.fontSize)}>{Math.round(model!.fontSize)}</option>
              )}
              {fontSizes.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="board-inspector-icons">
            {[
              [Bold, 'Жирный', 'bold'],
              [Italic, 'Курсив', 'italic'],
              [Underline, 'Подчёркнутый', 'underline'],
            ].map(([Icon, label, key]: any) => (
              <span key={key}>
                {icon(
                  label,
                  Icon,
                  () => style({ [key]: !model![key as keyof TextModel] }),
                  locked,
                  !!model![key as keyof TextModel],
                )}
              </span>
            ))}
            <i />
            {[
              [AlignLeft, 'По левому краю', 'left'],
              [AlignCenter, 'По центру', 'center'],
              [AlignRight, 'По правому краю', 'right'],
            ].map(([Icon, label, align]: any) => (
              <span key={align}>
                {icon(
                  label,
                  Icon,
                  () => style({ textAlign: align }),
                  locked,
                  model!.align === align,
                )}
              </span>
            ))}
          </div>
        </>
      )}
      {!image && (
        <section>
          <label>{text ? 'Цвет текста' : note ? 'Текст' : 'Контур'}</label>
          <div className="board-inspector-colors">
            {inkColors.map((c, i) => (
              <button
                key={c}
                className={color === c ? 'active' : ''}
                aria-label={['Фиолетовый', 'Графитовый', 'Зелёный', 'Оранжевый', 'Лавандовый'][i]}
                style={{ background: c }}
                disabled={locked}
                onClick={() => (text ? style({ color: c }) : editor.current?.setColor(c))}
              />
            ))}
            {icon('Любой цвет', Palette, () => onColor(text ? 'text' : 'stroke'), locked)}
          </div>
        </section>
      )}
      {fill && (
        <section className="board-inspector-fill">
          <label>Заливка</label>
          <button
            className="board-fill-swatch"
            disabled={locked}
            aria-label="Цвет заливки"
            onClick={() => onColor(note ? 'note' : 'fill')}
          >
            <span
              style={{
                background:
                  selection.fill === 'transparent'
                    ? 'transparent'
                    : selection.fill || 'transparent',
              }}
            />
            {selection.fill === 'transparent' ? 'Нет' : selection.fill || 'Нет'}
          </button>
          <button
            className="board-clear-fill"
            aria-label="Без заливки"
            title="Без заливки"
            disabled={locked}
            onClick={() => editor.current?.setFill('transparent')}
          >
            ∅
          </button>
        </section>
      )}
      {!text && !image && (
        <label className="board-inspector-range">
          Толщина
          <div>
            <input
              aria-label="Толщина объекта"
              type="range"
              min={selection.inkTool === 'marker' ? markerSizes.min : penSizes.min}
              max={selection.inkTool === 'marker' ? markerSizes.max : penSizes.max}
              step={0.25}
              value={tool.width}
              disabled={locked}
              onChange={(e) => editor.current?.setWidth(Number(e.target.value))}
            />
            <output>{Number(tool.width.toFixed(2))}</output>
          </div>
        </label>
      )}
      <details className="board-inspector-extra">
        <summary>
          Прозрачность <span>{tool.opacity ?? 100}%</span>
        </summary>
        <input
          type="range"
          aria-label="Прозрачность объекта"
          min={5}
          max={100}
          step={5}
          disabled={locked}
          value={tool.opacity ?? 100}
          onChange={(e) => editor.current?.setOpacity(Number(e.target.value))}
        />
      </details>
      <footer className="board-inspector-icons">
        {icon('Дублировать', Copy, () => editor.current?.objectAction('duplicate'))}
        {icon('На передний план', ArrowUpToLine, () => editor.current?.objectAction('front'))}
        {icon('На задний план', ArrowDownToLine, () => editor.current?.objectAction('back'))}
        <i />
        {icon('Удалить', Trash2, () => editor.current?.objectAction('delete'))}
      </footer>
    </aside>
  );
}
