import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figures, type FigureSpec } from '../apps/web/src/board/catalog';
import {
  decorateLine,
  figureParts,
  figureFromDrag,
  lineParts,
} from '../apps/web/src/board/geometry';
import { canvasHit, objectSelection } from '../apps/web/src/board/interaction';
import { captureCanvas } from '../apps/web/src/board/canvas';
import { projectCanvas } from '../packages/contracts/canvas';

test('geometry templates use editable native vectors with finite, nondegenerate coordinates', () => {
  for (const figure of figures) {
    const spec: FigureSpec = { kind: figure.id, width: 200, height: 140, depth: 60 };
    for (const part of figureParts(spec)) {
      assert.ok(
        ['line', 'arrow', 'rectangle', 'ellipse', 'diamond', 'text'].includes(part.type),
        figure.id,
      );
      assert.ok(Number.isFinite(part.x) && Number.isFinite(part.y), figure.id);
      if (part.points) {
        assert.ok(part.points.length >= 2, figure.id);
        assert.ok(
          part.points.every((p: number[]) => p.every(Number.isFinite)),
          figure.id,
        );
        assert.ok(part.width > 0 || part.height > 0, figure.id);
      }
    }
  }
  const box = figureParts({ kind: 'cuboid', width: 250, height: 170, depth: 75 });
  assert.equal(box[0].width, 250);
  assert.equal(box[0].height, 170);
  assert.ok(box.some((p) => p.strokeStyle === 'dashed'));
  const sphere = figureParts({ kind: 'sphere', width: 200, height: 80, depth: 30 });
  assert.equal(sphere[0].width, sphere[0].height);
});
test('double, wavy and dash-dot lines follow a completed diagonal gesture without bitmap conversion', () => {
  const native = {
    id: 'source',
    type: 'line',
    x: 100,
    y: 90,
    width: 120,
    height: 90,
    points: [
      [0, 0],
      [120, 90],
    ],
    angle: 0,
    version: 2,
    versionNonce: 12,
    strokeColor: '#d22789',
    strokeWidth: 3.5,
    opacity: 100,
    groupIds: [],
  };
  const double = decorateLine(native, 'double', 'group');
  assert.equal(double.length, 2);
  assert.equal(double[0].id, native.id);
  for (const part of double) {
    assert.equal(part.type, 'line');
    assert.equal(part.strokeColor, native.strokeColor);
    assert.equal(part.strokeWidth, 3.5);
    assert.ok(Math.abs(Math.hypot(part.width, part.height) - 150) < 1e-6);
    assert.deepEqual(part.groupIds, ['group']);
  }
  const wave = decorateLine(native, 'wave', 'wave');
  assert.equal(wave.length, 1);
  assert.ok(wave[0].points.length > 10);
  const dashdot = lineParts('dashdot', 200);
  assert.ok(dashdot.some((p) => p.width === 2));
  assert.ok(dashdot.some((p) => p.width === 16));
  assert.ok(lineParts('wave', 1e6)[0].points.length <= 201);
  assert.ok(lineParts('dashdot', 1e6).length <= 400);
});
const base = (id: string, fields: any = {}) => ({
  id,
  type: 'rectangle',
  version: 1,
  versionNonce: 1,
  x: 0,
  y: 0,
  width: 240,
  height: 180,
  isDeleted: false,
  angle: 0,
  ...fields,
});
test('dragged figures fit the gesture in all directions, with optional constrained proportions', () => {
  for (const figure of figures)
    for (const end of [
      [410, 285],
      [80, 45],
    ] as [number, number][]) {
      const { parts } = figureFromDrag(figure.id, [210, 165], end);
      const x = Math.min(...parts.map((p) => p.x)),
        y = Math.min(...parts.map((p) => p.y)),
        w = Math.max(...parts.map((p) => p.x + p.width)) - x,
        h = Math.max(...parts.map((p) => p.y + p.height)) - y;
      if (!['square', 'circle', 'sphere'].includes(figure.id)) {
        assert.ok(Math.abs(w - Math.abs(end[0] - 210)) < 1e-6, figure.id);
        assert.ok(Math.abs(h - Math.abs(end[1] - 165)) < 1e-6, figure.id);
      } else assert.ok(Math.abs(w - h) < 1e-6, figure.id);
      assert.ok(parts.every((p) => Number.isFinite(p.x + p.y + p.width + p.height)));
    }
  const { parts } = figureFromDrag('cube', [100, 100], [120, 110], true);
  assert.ok(
    parts.every((p) => p.x >= 100 && p.y >= 100 && p.x + p.width <= 120 && p.y + p.height <= 120),
  );
});
test('locked objects can be picked without intercepting empty interiors or higher objects', () => {
  const frame = base('frame', { locked: true, backgroundColor: 'transparent' });
  const text = base('text', { type: 'text', x: 20, y: 30, width: 60, height: 24 });
  assert.equal(canvasHit([frame, text], { x: 40, y: 40 }, 3)?.id, 'text');
  assert.equal(canvasHit([frame, text], { x: 0, y: 70 }, 3)?.id, 'frame');
  assert.equal(canvasHit([frame], { x: 100, y: 80 }, 3), undefined);
  const rotated = base('rotated', {
    type: 'text',
    width: 100,
    height: 20,
    angle: Math.PI / 2,
    locked: true,
  });
  assert.equal(canvasHit([rotated], { x: 50, y: 50 }, 3)?.id, 'rotated');
  assert.equal(canvasHit([rotated], { x: 0, y: 10 }, 3), undefined);
  const parent = base('parent', { groupIds: ['outer'], locked: true });
  const bound = base('label', { type: 'text', containerId: 'parent', locked: true });
  const edge = base('edge', { type: 'line', groupIds: ['outer'], locked: true });
  assert.deepEqual(
    new Set(objectSelection([parent, bound, edge], 'label')),
    new Set(['parent', 'label', 'edge']),
  );
  assert.equal(canvasHit([{ ...frame, isDeleted: true }], { x: 0, y: 70 }, 3), undefined);
});
test('ink written on a sticker follows translation, scale and rotation once', () => {
  const note = base('note', { customData: { sticker: { kind: 'note' } } });
  const ink = base('ink', {
    type: 'freedraw',
    x: 40,
    y: 50,
    width: 80,
    height: 20,
    points: [
      [0, 0],
      [80, 20],
    ],
  });
  const saved = captureCanvas([note, ink], [note]);
  assert.deepEqual(saved[1].customData.stickerAnnotation, { stickerId: 'note' });
  const moved = { ...note, x: 100, y: 80, width: 480, height: 360, version: 2 };
  const scene = captureCanvas([moved, saved[1]], saved);
  assert.equal(scene[1].x, 180);
  assert.equal(scene[1].y, 180);
  assert.deepEqual(scene[1].points, [
    [0, 0],
    [160, 40],
  ]);
  assert.deepEqual(captureCanvas(scene, scene), scene);
  const rotated = captureCanvas([{ ...moved, angle: Math.PI / 2, version: 3 }, scene[1]], scene);
  assert.ok(Math.abs(rotated[1].angle - Math.PI / 2) < 1e-8);
  assert.deepEqual(captureCanvas(rotated, rotated), rotated);
});
test('a sticker and its ink inherit their PDF slide visibility without deleting stored strokes', () => {
  const pdf = base('pdf', {
    type: 'image',
    width: 800,
    height: 600,
    customData: {
      presentation: {
        sourceId: 'source',
        title: 'PDF',
        slideIndex: 0,
        slides: [{ fileId: 'a' }, { fileId: 'b' }],
      },
    },
  });
  const note = base('note', { x: 40, y: 50, customData: { sticker: { kind: 'note' } } });
  const first = captureCanvas([pdf, note], [pdf]);
  const ink = base('ink', {
    type: 'freedraw',
    x: 70,
    y: 80,
    width: 40,
    height: 15,
    points: [
      [0, 0],
      [40, 15],
    ],
  });
  const saved = captureCanvas([...first, ink], first);
  assert.deepEqual(saved[2].customData.stickerAnnotation, { stickerId: 'note' });
  const moved = captureCanvas(
    [{ ...saved[0], x: 100, y: 200, width: 1600, height: 1200, version: 2 }, ...saved.slice(1)],
    saved,
  );
  assert.equal(moved[1].x, 180);
  assert.equal(moved[2].x, 240);
  assert.equal(moved[2].y, 360);
  const switched = [
    {
      ...moved[0],
      customData: { presentation: { ...moved[0].customData.presentation, slideIndex: 1 } },
    },
    ...moved.slice(1),
  ];
  const projected = projectCanvas(switched);
  assert.equal(projected[1].isDeleted, true);
  assert.equal(projected[2].isDeleted, true);
  const stored = captureCanvas(projected, switched);
  assert.equal(stored[1].isDeleted, false);
  assert.equal(stored[2].isDeleted, false);
});
