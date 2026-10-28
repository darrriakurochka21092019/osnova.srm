import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unifyLegacyScenes, projectCanvas, presentationOf } from '../packages/contracts/canvas';
import { captureCanvas, snapshotCanvas, repairCanvasGeometry } from '../apps/web/src/board/canvas';
import { repairOfflineDraft } from '../apps/web/src/board/offline';
const shape = (id: string, extra: any = {}) => ({
  id,
  type: 'rectangle',
  version: 1,
  versionNonce: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  isDeleted: false,
  ...extra,
});
const deck = () =>
  shape('pdf', {
    type: 'image',
    fileId: 'slide-a',
    width: 400,
    height: 300,
    customData: {
      presentation: {
        sourceId: 'source',
        title: 'Physics',
        slideIndex: 0,
        slides: [
          { fileId: 'slide-a', width: 400, height: 300 },
          { fileId: 'slide-b', width: 400, height: 300 },
        ],
      },
    },
  });

test('damaged pen dimensions recover from samples without changing origin, pressure, metadata or good geometry', () => {
  const ink = shape('ink', {
    type: 'freedraw',
    x: 140,
    y: -30,
    width: NaN,
    height: null,
    points: [
      [0, 0],
      [-80, 20],
      [30, -40],
    ],
    pressures: [0.2, 0.7, 0.4],
    customData: { formula: { title: 'keep' } },
  });
  const original = structuredClone(ink),
    fixed = repairCanvasGeometry([ink])[0];
  assert.equal(fixed.width, 110);
  assert.equal(fixed.height, 60);
  assert.equal(fixed.x, 140);
  assert.equal(fixed.y, -30);
  assert.deepEqual(fixed.points, ink.points);
  assert.deepEqual(fixed.pressures, ink.pressures);
  assert.deepEqual(fixed.customData, ink.customData);
  assert.ok(fixed.version > ink.version);
  assert.deepEqual(ink, original);
  assert.equal(repairCanvasGeometry([fixed])[0], fixed);
  assert.equal(repairCanvasGeometry([fixed], [fixed])[0], fixed);
  const badTail = {
    ...fixed,
    points: [...fixed.points, [NaN, Infinity]],
    pressures: [...fixed.pressures, undefined],
    lastCommittedPoint: [NaN, NaN],
  };
  const clean = repairCanvasGeometry([badTail])[0];
  assert.deepEqual(clean.points, ink.points);
  assert.deepEqual(clean.pressures, ink.pressures);
  assert.deepEqual(clean.lastCommittedPoint, [30, -40]);
  const deleted = repairCanvasGeometry([
    shape('cancelled', {
      type: 'line',
      isDeleted: true,
      width: -Infinity,
      height: -Infinity,
      points: [],
    }),
  ])[0];
  assert.equal(deleted.width, 0);
  assert.equal(deleted.height, 0);
  assert.equal(deleted.isDeleted, true);
  const unknown = shape('unknown', { x: NaN });
  assert.equal(repairCanvasGeometry([unknown])[0], unknown, 'Never invent a visible object origin');
  assert.equal(repairCanvasGeometry([unknown], [shape('unknown', { x: 80 })])[0].x, 80);
});
test('draft repair replaces only rejected malformed operations and preserves idempotence of valid retries', () => {
  const ink = shape('ink', {
    type: 'freedraw',
    width: NaN,
    height: Infinity,
    points: [
      [0, 0],
      [50, 30],
    ],
  });
  const pending = {
    id: 'rejected',
    changes: [{ element: structuredClone(ink), baseVersion: null }],
  };
  const fixed = repairOfflineDraft({ elements: [ink], base: [], files: {}, pending });
  assert.notEqual(fixed.pending!.id, pending.id);
  assert.equal(fixed.pending!.changes[0].element, fixed.elements[0]);
  assert.equal(fixed.elements[0].width, 50);
  const retried = repairOfflineDraft({ ...fixed, pending: structuredClone(fixed.pending) });
  assert.equal(retried.pending!.id, fixed.pending!.id, 'Keep the UUID after a lost successful ACK');
  assert.deepEqual(retried.pending!.changes, fixed.pending!.changes);
  const newer = {
    ...ink,
    version: 2,
    versionNonce: 10,
    width: 70,
    height: 30,
    points: [
      [0, 0],
      [70, 30],
    ],
  };
  const advanced = repairOfflineDraft({ elements: [newer], base: [], files: {}, pending });
  assert.ok(advanced.elements[0].version > advanced.pending!.changes[0].element.version);
  assert.deepEqual(advanced.elements[0].points, newer.points);
});
test('collapsing and moving a sticker or PDF never divides its annotation geometry by zero', () => {
  for (const type of ['sticker', 'presentation']) {
    const parent =
      type === 'sticker' ? shape('parent', { customData: { sticker: { kind: 'note' } } }) : deck();
    const ink = shape('child', {
      type: 'freedraw',
      x: 25,
      y: 35,
      width: 20,
      height: 10,
      points: [
        [0, 0],
        [20, 10],
      ],
      customData:
        type === 'sticker'
          ? { stickerAnnotation: { stickerId: parent.id } }
          : { slideAnnotation: { presentationId: parent.id, slideIndex: 0 } },
    });
    const collapsed = { ...parent, width: 0, height: 0, version: 2 };
    const a = captureCanvas([collapsed, ink], [parent, ink]);
    const b = captureCanvas([{ ...collapsed, x: 140, y: 160, version: 3 }, a[1]], a);
    const c = captureCanvas([{ ...parent, x: 140, y: 160, version: 4 }, b[1]], b);
    for (const scene of [a, b, c]) {
      assert.deepEqual(scene[1].points, ink.points);
      assert.ok(['x', 'y', 'width', 'height'].every((key) => Number.isFinite(scene[1][key])));
    }
  }
});

test('legacy pages are arranged on one canvas without mutating the source or colliding IDs', () => {
  const pages = [
    { id: 'first', title: 'Old 1', scene: [shape('same')] },
    {
      id: 'second',
      title: 'Old 2',
      scene: [shape('same'), shape('other', { containerId: 'same' })],
    },
  ];
  const original = structuredClone(pages),
    merged = unifyLegacyScenes(pages);
  assert.deepEqual(pages, original);
  assert.equal(new Set(merged.map((e) => e.id)).size, 3);
  assert.ok((merged[1].x as number) >= (merged[0].width as number) + 100);
  assert.equal(merged[2].containerId, merged[1].id);
});
test('legacy PDF pages form a single presentation and keep annotations on their own slides', () => {
  const pages = [0, 1].map((n) => ({
    id: `page-${n}`,
    title: `Physics · ${n + 1}`,
    scene: [
      shape(`image-${n}`, {
        type: 'image',
        fileId: `file-${n}`,
        customData: { pdfSourceId: 'source', pdfPage: n + 1 },
      }),
      shape(`note-${n}`, { type: 'text', text: `slide ${n + 1}` }),
    ],
  }));
  const original = structuredClone(pages),
    scene = unifyLegacyScenes(pages),
    pdf = scene.find((e) => presentationOf(e))!;
  assert.deepEqual(pages, original);
  assert.equal(scene.filter((e) => e.type === 'image').length, 1);
  assert.equal(presentationOf(pdf)!.slides.length, 2);
  const annotations = scene.filter((e) => e.type === 'text') as any[];
  assert.deepEqual(
    annotations.map((e) => e.customData.slideAnnotation.slideIndex),
    [0, 1],
  );
  assert.ok(annotations.every((e) => e.customData.slideAnnotation.presentationId === pdf.id));
});
test('switching slides hides annotations as a projection without deleting them from the stored scene', () => {
  const pdf = deck(),
    a = shape('a', { customData: { slideAnnotation: { presentationId: 'pdf', slideIndex: 0 } } }),
    b = shape('b', { customData: { slideAnnotation: { presentationId: 'pdf', slideIndex: 1 } } });
  const scene = [pdf, a, b],
    visible = projectCanvas(scene);
  assert.equal(visible[1].isDeleted, false);
  assert.equal(visible[2].isDeleted, true);
  const captured = captureCanvas(visible, scene);
  assert.equal(captured[2].isDeleted, false);
  assert.equal(captured[2].version, 1);
  const normalized = captureCanvas(
    [visible[0], visible[1], { ...visible[2], version: 2, index: 'a2' }],
    scene,
  );
  assert.equal(normalized[2].isDeleted, false);
  assert.equal(normalized[2].version, 2);
  assert.equal(normalized[2].index, 'a2');
  assert.deepEqual(captureCanvas(projectCanvas(normalized), normalized), normalized);
  const next = { ...pdf, customData: { presentation: { ...presentationOf(pdf), slideIndex: 1 } } };
  const switched = projectCanvas([next, a, b]);
  assert.equal(switched[1].isDeleted, true);
  assert.equal(switched[2].isDeleted, false);
});

test('committed ink stays immutable when the native engine mutates live points and pressure', () => {
  const live = shape('ink', {
    type: 'freedraw',
    points: [
      [0, 0],
      [10, 8],
    ],
    pressures: [0.2, 0.7],
  });
  const saved = snapshotCanvas([live], []);
  live.points[1][0] = 99;
  live.pressures.push(0.8);
  assert.equal(saved[0].points[1][0], 10);
  assert.deepEqual(saved[0].pressures, [0.2, 0.7]);
  assert.equal(snapshotCanvas([structuredClone(saved[0])], saved)[0], saved[0]);
});
test('new ink inside a PDF belongs to that slide; moving/resizing the PDF moves its annotations once', () => {
  const pdf = deck(),
    ink = shape('ink', {
      type: 'freedraw',
      x: 30,
      y: 40,
      width: 40,
      height: 10,
      points: [
        [0, 0],
        [40, 10],
      ],
    });
  const created = captureCanvas([pdf, ink], [pdf]);
  assert.deepEqual(created[1].customData.slideAnnotation, { presentationId: 'pdf', slideIndex: 0 });
  const moved = { ...pdf, x: 50, y: 70, width: 800, height: 600, version: 2 };
  const result = captureCanvas([moved, created[1]], created);
  assert.equal(result[1].x, 110);
  assert.equal(result[1].y, 150);
  assert.deepEqual(result[1].points, [
    [0, 0],
    [80, 20],
  ]);
  const again = captureCanvas(result, result);
  assert.deepEqual(again, result);
  // Pointer drags leave native elements alone until the final capture against the drag origin.
  const dragging = captureCanvas([moved, created[1]], created, {
    transform: false,
    attachNew: false,
  });
  assert.equal(dragging[1].x, ink.x);
  const released = captureCanvas(dragging, structuredClone(created));
  assert.equal(released[1].x, result[1].x);
  assert.deepEqual(released[1].points, result[1].points);
});
