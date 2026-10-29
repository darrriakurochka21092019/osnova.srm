import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { hexRgb, rgbHex, rgbHsv, hsvHex } from './color';
export default function ColorPicker({
  color,
  opacity,
  onApply,
  onClose,
}: {
  color: string;
  opacity: number;
  onApply: (hex: string, opacity: number) => void;
  onClose: () => void;
}) {
  const initial = /^#[\da-f]{6}$/i.test(color) ? color : '#6038ff';
  const [hex, setHex] = useState(initial),
    [hsv, setHsv] = useState(rgbHsv(hexRgb(initial))),
    [alpha, setAlpha] = useState(opacity);
  const square = useRef<HTMLDivElement>(null);
  const update = (next: string) => {
    setHex(next);
    if (/^#[\da-f]{6}$/i.test(next)) setHsv(rgbHsv(hexRgb(next)));
  };
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = square.current!.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - b.x) / b.width)),
      v = 1 - Math.max(0, Math.min(1, (e.clientY - b.y) / b.height));
    setHsv([hsv[0], s, v]);
    setHex(hsvHex(hsv[0], s, v));
  };
  const rgb = /^#[\da-f]{6}$/i.test(hex) ? hexRgb(hex) : hexRgb(initial);
  return (
    <div
      className="board-tool-panel board-color-picker"
      role="dialog"
      aria-label="Произвольный цвет"
    >
      <div className="board-panel-head">
        <h2>Произвольный цвет</h2>
        <button aria-label="Закрыть выбор цвета" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      <div className="board-picker-body">
        <div
          ref={square}
          className="board-sv-square"
          role="slider"
          tabIndex={0}
          aria-label="Насыщенность и яркость"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv[1] * 100)}
          aria-valuetext={`${Math.round(hsv[1] * 100)}%, ${Math.round(hsv[2] * 100)}%`}
          style={{ backgroundColor: hsvHex(hsv[0], 1, 1) }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons & 1) pick(e);
          }}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            const s = Math.max(
                0,
                Math.min(
                  1,
                  hsv[1] + (e.key === 'ArrowRight' ? 0.02 : e.key === 'ArrowLeft' ? -0.02 : 0),
                ),
              ),
              v = Math.max(
                0,
                Math.min(
                  1,
                  hsv[2] + (e.key === 'ArrowUp' ? 0.02 : e.key === 'ArrowDown' ? -0.02 : 0),
                ),
              );
            setHsv([hsv[0], s, v]);
            setHex(hsvHex(hsv[0], s, v));
          }}
        >
          <span style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }} />
        </div>
        <input
          className="board-hue-range"
          type="range"
          aria-label="Цветовой тон"
          min={0}
          max={360}
          value={hsv[0]}
          onChange={(e) => {
            const h = Number(e.target.value);
            setHsv([h, hsv[1], hsv[2]]);
            setHex(hsvHex(h, hsv[1], hsv[2]));
          }}
        />
        <div className="board-picker-values">
          <div className="board-color-sample" style={{ background: hex, opacity: alpha / 100 }} />
          <input
            aria-label="Цвет HEX"
            value={hex.toUpperCase()}
            maxLength={7}
            onChange={(e) => update(e.target.value)}
          />
          <div className="board-rgb-fields">
            {['R', 'G', 'B'].map((name, i) => (
              <label key={name}>
                {name}
                <input
                  aria-label={`Цвет ${name}`}
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[i]}
                  onChange={(e) =>
                    update(rgbHex(rgb.map((n, j) => (i === j ? Number(e.target.value) : n))))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      </div>
      <label className="board-opacity-label">
        Прозрачность{' '}
        <div>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            aria-label="Прозрачность цвета"
            value={alpha}
            onChange={(e) => setAlpha(Number(e.target.value))}
          />
          <output>{alpha}%</output>
        </div>
      </label>
      <button
        className="btn btn-primary board-panel-submit"
        disabled={!/^#[\da-f]{6}$/i.test(hex)}
        onClick={() => onApply(hex.toLowerCase(), alpha)}
      >
        Применить
      </button>
    </div>
  );
}
