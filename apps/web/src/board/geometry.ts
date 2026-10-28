import type { FigureKind, FigureSpec, LineKind } from './catalog';
export type Point = [number, number];
const tau = Math.PI * 2;
export function figureFromDrag(kind: FigureKind, start: Point, end: Point, constrain = false) {
  let width = Math.max(1, Math.abs(end[0] - start[0])),
    height = Math.max(1, Math.abs(end[1] - start[1]));
  if (constrain || ['square', 'circle', 'sphere'].includes(kind))
    width = height = Math.max(width, height);
  const x = end[0] < start[0] ? start[0] - width : start[0],
    y = end[1] < start[1] ? start[1] - height : start[1];
  const spec: FigureSpec = { kind, width, height, depth: Math.min(width, height) * 0.3 };
  const parts = figureParts(spec).map((p) =>
    p.type === 'text'
      ? { ...p, width: p.fontSize * p.text.length * 0.65, height: p.fontSize * 1.15 }
      : p,
  );
  const minX = Math.min(...parts.map((p) => p.x)),
    minY = Math.min(...parts.map((p) => p.y));
  const sx = width / (Math.max(...parts.map((p) => p.x + p.width)) - minX || 1),
    sy = height / (Math.max(...parts.map((p) => p.y + p.height)) - minY || 1);
  return {
    spec,
    parts: parts.map((p) => ({
      ...p,
      x: x + (p.x - minX) * sx,
      y: y + (p.y - minY) * sy,
      width: p.width * sx,
      height: p.height * sy,
      ...(p.type === 'text' ? { fontSize: p.fontSize * Math.min(sx, sy) } : {}),
      ...(p.points ? { points: p.points.map(([px, py]: Point) => [px * sx, py * sy]) } : {}),
    })),
  };
}
export function path(points: Point[], style: Record<string, any> = {}) {
  const x = Math.min(...points.map((p) => p[0])),
    y = Math.min(...points.map((p) => p[1]));
  return {
    type: 'line',
    x,
    y,
    width: Math.max(...points.map((p) => p[0])) - x,
    height: Math.max(...points.map((p) => p[1])) - y,
    points: points.map(([px, py]) => [px - x, py - y]),
    strokeColor: '#252846',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    ...style,
  };
}
const closed = (points: Point[], style: Record<string, any> = {}) =>
  path([...points, points[0]], style);
const ellipse = (
  x: number,
  y: number,
  width: number,
  height: number,
  style: Record<string, any> = {},
) => ({
  type: 'ellipse',
  x,
  y,
  width,
  height,
  roughness: 0,
  strokeWidth: 2,
  strokeColor: '#252846',
  ...style,
});
export function figureParts(spec: FigureSpec): any[] {
  const w = Math.max(40, Math.min(1200, spec.width)),
    h = Math.max(40, Math.min(1200, spec.height)),
    d = Math.max(15, Math.min(400, spec.depth)),
    dy = d * 0.62;
  const line = (a: Point, b: Point, dashed = false) =>
    path([a, b], { strokeStyle: dashed ? 'dashed' : 'solid' });
  const rect = (x: number, y: number, width: number, height: number) => ({
    type: 'rectangle',
    x,
    y,
    width,
    height,
    roughness: 0,
    strokeWidth: 2,
    strokeColor: '#252846',
  });
  switch (spec.kind) {
    case 'rectangle':
      return [rect(0, 0, w, h)];
    case 'square':
      return [rect(0, 0, w, w)];
    case 'circle':
      return [ellipse(0, 0, w, w)];
    case 'ellipse':
      return [ellipse(0, 0, w, h)];
    case 'diamond':
      return [{ ...rect(0, 0, w, h), type: 'diamond' }];
    case 'triangle':
      return [
        closed([
          [w / 2, 0],
          [w, h],
          [0, h],
        ]),
      ];
    case 'right-triangle':
      return [
        closed([
          [0, 0],
          [w, h],
          [0, h],
        ]),
      ];
    case 'parallelogram':
      return [
        closed([
          [w * 0.25, 0],
          [w, 0],
          [w * 0.75, h],
          [0, h],
        ]),
      ];
    case 'trapezoid':
      return [
        closed([
          [w * 0.22, 0],
          [w * 0.78, 0],
          [w, h],
          [0, h],
        ]),
      ];
    case 'pentagon':
    case 'hexagon': {
      const n = spec.kind === 'hexagon' ? 6 : 5;
      return [
        closed(
          Array.from(
            { length: n },
            (_, i) =>
              [
                w / 2 + (Math.cos(-Math.PI / 2 + (i * tau) / n) * w) / 2,
                h / 2 + (Math.sin(-Math.PI / 2 + (i * tau) / n) * h) / 2,
              ] as Point,
          ),
        ),
      ];
    }
    case 'axes':
      return [
        {
          ...path([
            [0, h * 0.65],
            [w, h * 0.65],
          ]),
          type: 'arrow',
          endArrowhead: 'arrow',
        },
        {
          ...path([
            [w * 0.3, h],
            [w * 0.3, 0],
          ]),
          type: 'arrow',
          endArrowhead: 'arrow',
        },
        { type: 'text', x: w - 12, y: h * 0.65 + 10, text: 'x', fontSize: 20, fontFamily: 2 },
        { type: 'text', x: w * 0.3 + 12, y: 0, text: 'y', fontSize: 20, fontFamily: 2 },
        { type: 'text', x: w * 0.3 - 22, y: h * 0.65 + 9, text: '0', fontSize: 16, fontFamily: 2 },
      ];
    case 'cube':
    case 'cuboid': {
      const height = spec.kind === 'cube' ? w : h;
      return [
        rect(0, dy, w, height),
        line([d, 0], [w + d, 0]),
        line([w + d, 0], [w + d, height]),
        line([0, dy], [d, 0]),
        line([w, dy], [w + d, 0]),
        line([w, dy + height], [w + d, height]),
        line([d, 0], [d, height], true),
        line([d, height], [w + d, height], true),
        line([0, dy + height], [d, height], true),
      ];
    }
    case 'prism': {
      const a: Point = [0, h],
        b: Point = [w, h],
        c: Point = [w * 0.5, 0],
        off = (p: Point): Point => [p[0] + d, p[1] - dy];
      return [
        closed([a, b, c]),
        line(off(a), off(b), true),
        line(off(a), off(c), true),
        line(off(b), off(c)),
        line(a, off(a), true),
        line(b, off(b)),
        line(c, off(c)),
      ];
    }
    case 'pyramid': {
      const a: Point = [0, h],
        b: Point = [w * 0.7, h + dy],
        c: Point = [w, h],
        back: Point = [w * 0.3, h - dy],
        top: Point = [w * 0.5, 0];
      return [
        line(a, b),
        line(b, c),
        line(c, back, true),
        line(back, a, true),
        line(top, a),
        line(top, b),
        line(top, c),
        line(top, back, true),
      ];
    }
    case 'cylinder':
      return [
        ellipse(0, 0, w, dy),
        ellipse(0, h, w, dy),
        line([0, dy / 2], [0, h + dy / 2]),
        line([w, dy / 2], [w, h + dy / 2]),
      ];
    case 'cone':
      return [
        ellipse(0, h, w, dy),
        line([w / 2, 0], [0, h + dy / 2]),
        line([w / 2, 0], [w, h + dy / 2]),
        line([w / 2, 0], [w / 2, h + dy / 2], true),
      ];
    case 'sphere':
      return [
        ellipse(0, 0, w, w),
        ellipse(0, w * 0.37, w, w * 0.26, { strokeStyle: 'dashed' }),
        ellipse(w * 0.31, 0, w * 0.38, w, { strokeStyle: 'dashed' }),
      ];
  }
}
export function lineParts(kind: LineKind, length: number): any[] {
  const n = Math.max(1, length),
    wave = Math.min(5, n / 12);
  if (kind === 'double')
    return [
      path([
        [0, -3],
        [n, -3],
      ]),
      path([
        [0, 3],
        [n, 3],
      ]),
    ];
  if (kind === 'wave' || kind === 'root') {
    const count = kind === 'root' ? 24 : Math.max(12, Math.min(200, Math.ceil(n / 3)));
    return [
      path(
        Array.from(
          { length: count + 1 },
          (_, i) =>
            [
              (n * i) / count,
              kind === 'root'
                ? -Math.sin((Math.PI * i) / count) * Math.min(20, n * 0.16)
                : Math.sin((((i / count) * n) / 18) * tau) * wave,
            ] as Point,
        ),
      ),
    ];
  }
  if (kind === 'prefix')
    return [
      path([
        [0, 7],
        [0, 0],
        [n, 0],
        [n, 7],
      ]),
    ];
  if (kind === 'suffix')
    return [
      path([
        [0, 0],
        [n / 2, -Math.min(18, n * 0.2)],
        [n, 0],
      ]),
    ];
  if (kind === 'dashdot') {
    const parts: any[] = [];
    const unit = Math.max(28, n / 200);
    for (let x = 0; x < n - 1e-6; x += unit) {
      parts.push(
        path([
          [x, 0],
          [Math.min(x + (unit * 16) / 28, n), 0],
        ]),
      );
      if (x + (unit * 22) / 28 < n)
        parts.push(
          path([
            [x + (unit * 22) / 28, 0],
            [Math.min(x + (unit * 24) / 28, n), 0],
          ]),
        );
    }
    return parts;
  }
  return [
    path(
      [
        [0, 0],
        [n, 0],
      ],
      { strokeStyle: kind === 'dashed' ? 'dashed' : kind === 'dotted' ? 'dotted' : 'solid' },
    ),
  ];
}
/** Native vectors: no bitmap assets and no per-pointer-sample expansion. */
export function decorateLine(element: any, kind: LineKind, groupId: string) {
  const points = (element.points || []) as Point[],
    start = points[0] || [0, 0],
    end = points[points.length - 1] || [element.width, 0];
  const dx = end[0] - start[0],
    dy = end[1] - start[1],
    length = Math.hypot(dx, dy),
    angle = Math.atan2(dy, dx) + (element.angle || 0);
  if (!Number.isFinite(length) || !Number.isFinite(angle) || length < 3) return [element];
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return lineParts(kind, length).map((part, i) => {
    const abs = (part.points as Point[]).map(([px, py]) => {
      const x = px + part.x,
        y = py + part.y;
      return [element.x + start[0] + x * c - y * s, element.y + start[1] + x * s + y * c] as Point;
    });
    return {
      ...element,
      ...path(abs),
      id: i === 0 ? element.id : `${groupId}-${i}`,
      angle: 0,
      version: i === 0 ? element.version + 1 : 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      strokeColor: element.strokeColor,
      strokeWidth: element.strokeWidth,
      opacity: element.opacity,
      groupIds:
        kind === 'single' || kind === 'dashed' || kind === 'dotted'
          ? element.groupIds
          : [groupId, ...(element.groupIds || [])],
      strokeStyle: part.strokeStyle,
      customData: { ...element.customData, boardLine: { kind, groupId } },
    };
  });
}
export function badgeParts(kind: string, color: string): any[] {
  const fill = {
    backgroundColor: color,
    fillStyle: 'solid',
    strokeColor: '#252846',
    strokeWidth: 2,
  };
  if (kind === 'star' || kind === 'medal') {
    const points = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 35 : 75;
      return [
        80 + Math.cos(-Math.PI / 2 + (i * Math.PI) / 5) * r,
        80 + Math.sin(-Math.PI / 2 + (i * Math.PI) / 5) * r,
      ] as Point;
    });
    return [
      ...(kind === 'medal'
        ? [
            closed(
              [
                [45, 125],
                [30, 200],
                [80, 173],
                [130, 200],
                [115, 125],
              ],
              { ...fill, backgroundColor: '#b9afff' },
            ),
          ]
        : []),
      closed(points, fill),
    ];
  }
  if (kind === 'heart')
    return [
      closed(
        [
          [80, 30],
          [64, 10],
          [30, 8],
          [5, 35],
          [5, 65],
          [23, 94],
          [80, 145],
          [137, 94],
          [155, 65],
          [155, 35],
          [130, 8],
          [96, 10],
        ],
        fill,
      ),
    ];
  if (kind === 'smile')
    return [
      ellipse(0, 0, 150, 150, fill),
      ellipse(39, 45, 9, 13, { backgroundColor: '#252846', fillStyle: 'solid' }),
      ellipse(99, 45, 9, 13, { backgroundColor: '#252846', fillStyle: 'solid' }),
      path(
        [
          [40, 93],
          [50, 107],
          [75, 115],
          [100, 107],
          [110, 93],
        ],
        { strokeWidth: 3 },
      ),
    ];
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 210,
      height: 85,
      ...fill,
      roughness: 0,
      roundness: { type: 3 },
      label: {
        text:
          kind === 'idea'
            ? 'Идея!'
            : kind === 'question'
              ? 'Подумай'
              : kind === 'check'
                ? 'Проверь'
                : 'Отлично!',
        fontFamily: 5,
        fontSize: 25,
        strokeColor: '#252846',
      },
    },
  ];
}
