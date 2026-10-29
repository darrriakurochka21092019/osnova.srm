import { useLayoutEffect, useRef } from 'react';
import { textFamily, type TextModel } from './richText';
export type TextEditing = {
  id: string;
  x: number;
  y: number;
  angle: number;
  model: TextModel;
  groupIds?: string[];
  customData?: Record<string, any>;
};
export default function RichTextEditor({
  value,
  view,
  onChange,
  onCommit,
  onCancel,
}: {
  value: TextEditing;
  view: { scrollX: number; scrollY: number; zoom: number; width: number; height: number };
  onChange: (model: TextModel) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, [value.id]);
  useLayoutEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.max(value.model.fontSize * view.zoom * 1.6, el.scrollHeight)}px`;
    }
  }, [value.model, view.zoom]);
  const m = value.model;
  return (
    <textarea
      ref={input}
      className="board-rich-input"
      aria-label="Текст на доске"
      value={m.text}
      maxLength={20000}
      placeholder="Введите текст…"
      spellCheck={false}
      style={{
        left: Math.max(8, Math.min((value.x + view.scrollX) * view.zoom, view.width - 100)),
        top: Math.max(8, Math.min((value.y + view.scrollY) * view.zoom, view.height - 60)),
        width: Math.min((m.maxWidth || 440) * view.zoom, view.width - 24),
        fontFamily: `"${textFamily(m.family)}", Arial, sans-serif`,
        fontSize: m.fontSize * view.zoom,
        fontWeight: m.bold ? 700 : 400,
        fontStyle: m.italic ? 'italic' : 'normal',
        textDecoration: m.underline ? 'underline' : 'none',
        textAlign: m.align,
        color: m.color,
        transform: `rotate(${value.angle || 0}rad)`,
      }}
      onChange={(e) => onChange({ ...m, text: e.target.value })}
      onBlur={(e) => {
        if (!(e.relatedTarget as HTMLElement)?.closest('.board-text-toolbar,.board-tool-panel'))
          onCommit();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onCommit();
        }
      }}
    />
  );
}
