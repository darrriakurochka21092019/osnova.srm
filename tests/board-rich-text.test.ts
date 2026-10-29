import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexRgb, rgbHex, rgbHsv, hsvHex } from '../apps/web/src/board/color';
import { defaultText, textModel, wrapText } from '../apps/web/src/board/richText';
import { pdfLayout } from '../apps/web/src/board/exportLayout';
import { duplicateObjects, objectSelection } from '../apps/web/src/board/interaction';
import { orderCanvas, projectCanvas } from '../packages/contracts/canvas';
import { dataUrlBlob } from '../apps/web/src/api';

test('custom colors retain exact RGB values through HSV and decode without network access', async () => {
  for (const hex of ['#000000', '#ffffff', '#6038ff', '#ff8b34', '#00a77a', '#c93472']) {
    assert.equal(rgbHex(hexRgb(hex)), hex);
    const [h, s, v] = rgbHsv(hexRgb(hex));
    assert.equal(hsvHex(h, s, v), hex);
  }
  assert.equal(hsvHex(360, 1, 1), '#ff0000');
  const blob = dataUrlBlob('data:image/png;base64,AQID');
  assert.equal(blob.type, 'image/png');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 2, 3]);
  assert.throws(() => dataUrlBlob('https://example.test/not-an-image'));
});
test('editable text preserves explicit lines, Cyrillic and resize-derived font size', () => {
  assert.deepEqual(
    wrapText('Мир\n\nДлинное слово', (s) => s.length, 7),
    ['Мир', '', 'Длинное', ' слово'],
  );
  const element = {
    type: 'image',
    width: 400,
    customData: {
      richText: { ...defaultText, text: 'Площадь', fontSize: 24, maxWidth: 180 },
      richTextSize: { width: 200 },
    },
  };
  assert.equal(textModel(element)?.fontSize, 48);
  assert.equal(textModel(element)?.maxWidth, 360);
  assert.equal(textModel(element)?.text, 'Площадь');
  assert.equal(
    textModel({
      type: 'text',
      text: 'A',
      fontFamily: 3,
      fontSize: 20,
      strokeColor: '#111',
      containerId: 'note',
    })?.containerId,
    'note',
  );
});
test('PDF paper sizes preserve aspect, orientation and printable margins', () => {
  for (const paper of ['a4', 'a3'] as const)
    for (const orientation of ['portrait', 'landscape'] as const) {
      const p = pdfLayout(1200, 600, paper, orientation);
      assert.equal(p.width / p.height, 2);
      assert.ok(p.x >= 24 && p.y >= 24);
      assert.equal(p.pageWidth > p.pageHeight, orientation === 'landscape');
    }
  assert.deepEqual(pdfLayout(800, 500, 'canvas', 'portrait'), {
    pageWidth: 800,
    pageHeight: 500,
    width: 800,
    height: 500,
    x: 0,
    y: 0,
  });
});
test('duplicate remaps grouped note text, ink and bindings without linking a copied object to originals', () => {
  const all: any[] = [
    {
      id: 'note',
      x: 10,
      y: 20,
      groupIds: ['g'],
      locked: true,
      boundElements: [
        { id: 'caption', type: 'text' },
        { id: 'external', type: 'arrow' },
      ],
      customData: { sticker: { kind: 'note' } },
    },
    {
      id: 'caption',
      x: 20,
      y: 30,
      groupIds: ['g'],
      customData: {
        richText: { ...defaultText, text: 'Идея', containerId: 'note' },
        stickerAnnotation: { stickerId: 'note' },
      },
    },
    {
      id: 'ink',
      x: 40,
      y: 80,
      groupIds: [],
      customData: { stickerAnnotation: { stickerId: 'note' } },
    },
    {
      id: 'arrow',
      x: 60,
      y: 70,
      groupIds: [],
      startBinding: { elementId: 'note', focus: 0 },
      endBinding: { elementId: 'external', focus: 0 },
    },
  ];
  assert.deepEqual(new Set(objectSelection(all, 'caption')), new Set(['note', 'caption', 'ink']));
  let id = 0;
  const copies = duplicateObjects(all, new Set(['caption', 'arrow']), () => `copy-${++id}`);
  assert.equal(copies.length, 4);
  const note = copies.find((e) => e.customData?.sticker)!,
    caption = copies.find((e) => e.customData?.richText)!,
    arrow = copies.find((e) => e.startBinding)!;
  assert.equal(caption.customData.richText.containerId, note.id);
  assert.equal(caption.customData.stickerAnnotation.stickerId, note.id);
  assert.equal(arrow.startBinding.elementId, note.id);
  assert.equal(arrow.endBinding, null);
  assert.equal(note.boundElements.length, 1);
  assert.equal(note.boundElements[0].id, caption.id);
  assert.equal(note.x, 34);
  assert.equal(note.locked, false);
  assert.notEqual(note.groupIds[0], 'g');
  assert.equal(all[0].locked, true);
});
test('layer order is derived from native fractional indices while older scenes retain stored order', () => {
  const first = { id: 'a', index: 'a0' },
    second = { id: 'b', index: 'a1' };
  assert.deepEqual(orderCanvas([second, first]), [first, second]);
  assert.deepEqual(projectCanvas([second, first]), [first, second]);
  const legacy = { id: 'old' };
  assert.deepEqual(orderCanvas([second, legacy, first]), [second, legacy, first]);
});
