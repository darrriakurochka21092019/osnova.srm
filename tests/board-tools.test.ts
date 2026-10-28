import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figures, type FigureSpec } from '../apps/web/src/board/catalog';
import { decorateLine, figureParts, lineParts } from '../apps/web/src/board/geometry';
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
