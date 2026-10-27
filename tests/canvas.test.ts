import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unifyLegacyScenes, projectCanvas, presentationOf } from '../packages/contracts/canvas';
import { captureCanvas } from '../apps/web/src/board/canvas';
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
  const next = { ...pdf, customData: { presentation: { ...presentationOf(pdf), slideIndex: 1 } } };
  const switched = projectCanvas([next, a, b]);
  assert.equal(switched[1].isDeleted, true);
  assert.equal(switched[2].isDeleted, false);
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
