import { useLayoutEffect, useRef, useState } from 'react';
import { textFamily, textFont, textLayout, type TextModel } from './richText';
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
  const input = useRef<HTMLTextAreaElement>(null),
    [size, setSize] = useState({ width: 40, height: 40, padding: 3 });
  const m = value.model;
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, [value.id]);
  useLayoutEffect(() => {
    const measure = () => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = textFont(m);
      const layout = textLayout(m, (s) => ctx.measureText(s).width);
      setSize({ width: layout.width + 4, height: layout.height, padding: layout.padding });
    };
    measure();
    document.fonts.addEventListener('loadingdone', measure);
    return () => document.fonts.removeEventListener('loadingdone', measure);
  }, [m]);
  return (
    <textarea
      ref={input}
      className="board-rich-input"
      aria-label="Текст на доске"
      value={m.text}
      maxLength={20000}
      spellCheck={false}
      style={
        {
          left: (value.x + view.scrollX) * view.zoom,
          top: (value.y + view.scrollY) * view.zoom,
          width: size.width * view.zoom,
          height: size.height * view.zoom,
          '--inline-padding': `${size.padding * view.zoom}px`,
          fontFamily: `"${textFamily(m.family)}",Arial,sans-serif`,
          fontSize: m.fontSize * view.zoom,
          fontWeight: m.bold ? 700 : 400,
          fontStyle: m.italic ? 'italic' : 'normal',
          textDecoration: m.underline ? 'underline' : 'none',
          textAlign: m.align,
          color: m.color,
          transform: `rotate(${value.angle || 0}rad)`,
        } as React.CSSProperties
      }
      onChange={(e) => onChange({ ...m, text: e.target.value })}
      onBlur={onCommit}
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
