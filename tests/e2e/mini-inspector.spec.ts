import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { loginTeacher, selectCanvasObject } from './helpers';
async function point(page: Page, x: number, y: number) {
  return page.locator('.canvas-paper').evaluate(
    (e, p) => {
      const n = e as HTMLElement,
        b = n.getBoundingClientRect(),
        z = parseFloat(n.style.backgroundSize) / 24,
        [sx, sy] = n.style.backgroundPosition.split(' ').map(parseFloat);
      return { x: b.x + p.x * z + sx, y: b.y + p.y * z + sy };
    },
    { x, y },
  );
}
test('a click only selects; body drags preserve shape and line geometry and open no editor', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const s = await (
      await request.post('/api/v1/students', { data: { name: 'Демо перенос фигур' } })
    ).json(),
    room = await (await request.get(`/api/v1/classrooms/${s.classroom_id}`)).json(),
    board = await (await request.get(`/api/v1/boards/${room.board_id}`)).json();
  const shapes = [
    {
      id: 'rect-drag',
      type: 'rectangle',
      x: 350,
      y: 240,
      width: 220,
      height: 150,
      angle: 0,
      strokeColor: '#11162e',
      backgroundColor: 'transparent',
      strokeWidth: 2,
      groupIds: [],
    },
    {
      id: 'line-drag',
      type: 'line',
      x: 700,
      y: 240,
      width: 220,
      height: 70,
      points: [
        [0, 0],
        [220, 70],
      ],
      angle: 0,
      strokeColor: '#6038ff',
      strokeWidth: 2,
      groupIds: [],
    },
  ].map((e) => ({ ...e, version: 1, versionNonce: 1, isDeleted: false }));
  const r = await request.post(`/api/v1/pages/${board.canvas_page_id}/operations`, {
    data: {
      operationId: crypto.randomUUID(),
      changes: shapes.map((element) => ({ element, baseVersion: null })),
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  const context = await browser.newContext({
      storageState: await request.storageState(),
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const scene = async () =>
    (await (await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)).json())
      .scene as any[];
  await page.goto(`/lesson/${room.id}/prepare`);
  await expect(page.getByRole('button', { name: 'Выделение', exact: true })).toBeEnabled();
  await expect(page.getByRole('complementary', { name: 'Свойства объекта' })).toHaveCount(0);
  const p = await point(page, 460, 315);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole('complementary', { name: 'Свойства объекта' })).toBeVisible();
  expect((await scene()).find((e) => e.id === 'rect-drag')).toMatchObject({
    type: 'rectangle',
    x: 350,
    y: 240,
    width: 220,
    height: 150,
    strokeColor: '#11162e',
    strokeWidth: 2,
    angle: 0,
  });
  await page.screenshot({ path: info.outputPath('shape-inspector.png') });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 95, p.y + 60, { steps: 15 });
  await expect(page.getByRole('complementary', { name: 'Свойства объекта' })).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(async () => (await scene()).find((e) => e.id === 'rect-drag')?.x).not.toBe(350);
  let moved = (await scene()).find((e) => e.id === 'rect-drag')!;
  expect(moved.width).toBe(220);
  expect(moved.height).toBe(150);
  expect(moved.strokeColor).toBe('#11162e');
  expect(moved.angle).toBe(0);
  await expect(page.getByRole('complementary', { name: 'Свойства объекта' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Отменить действие', exact: true }).click();
  await expect.poll(async () => (await scene()).find((e) => e.id === 'rect-drag')?.x).toBe(350);
  await selectCanvasObject(
    page,
    (await scene()).find((e) => e.id === 'rect-drag'),
  );
  const corner = await point(page, 570, 390);
  await page.mouse.move(corner.x + 8, corner.y + 8);
  await page.mouse.down();
  await page.mouse.move(corner.x + 68, corner.y + 38, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await scene()).find((e) => e.id === 'rect-drag')?.width)
    .toBeGreaterThan(220);
  await page.getByRole('button', { name: 'Отменить действие', exact: true }).click();
  await expect.poll(async () => (await scene()).find((e) => e.id === 'rect-drag')?.width).toBe(220);
  const l = await point(page, 810, 275);
  await page.mouse.click(l.x, l.y);
  await page.mouse.dblclick(l.x, l.y);
  expect((await scene()).find((e) => e.id === 'line-drag')?.points).toEqual([
    [0, 0],
    [220, 70],
  ]);
  await page.mouse.move(l.x, l.y);
  await page.mouse.down();
  await page.mouse.move(l.x - 75, l.y + 90, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await scene()).find((e) => e.id === 'line-drag')?.x).not.toBe(700);
  const line = (await scene()).find((e) => e.id === 'line-drag')!;
  expect(line.points).toEqual([
    [0, 0],
    [220, 70],
  ]);
  expect(line.width).toBe(220);
  expect(line.height).toBe(70);
  const end = await point(page, line.x, line.y);
  await page.mouse.click(end.x, end.y);
  await page.getByRole('button', { name: 'Закрепить выделенное', exact: true }).click();
  await expect
    .poll(async () => (await scene()).find((e) => e.id === 'line-drag')?.locked)
    .toBe(true);
  await page.getByRole('button', { name: 'Открепить выделенное', exact: true }).click();
  await expect
    .poll(async () => (await scene()).find((e) => e.id === 'line-drag')?.locked)
    .toBe(false);
  expect(errors).toEqual([]);
  await context.close();
});

test('inline writing has no popup or box; all objects share a compact inspector and stickers have no captions', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const s = await (
      await request.post('/api/v1/students', { data: { name: 'Демо простой текст' } })
    ).json(),
    room = await (await request.get(`/api/v1/classrooms/${s.classroom_id}`)).json(),
    board = await (await request.get(`/api/v1/boards/${room.board_id}`)).json();
  const context = await browser.newContext({
      storageState: await request.storageState(),
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const scene = async () =>
    (await (await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)).json())
      .scene as any[];
  await page.goto(`/lesson/${room.id}/prepare`);
  await expect(page.getByRole('button', { name: 'Текст', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  await page.mouse.click(area.x + 480, area.y + 300);
  const input = page.getByRole('textbox', { name: 'Текст на доске', exact: true });
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS('position', 'absolute');
  const inputBox = (await input.boundingBox())!;
  expect(inputBox.x).toBeCloseTo(area.x + 480, 0);
  expect(inputBox.y).toBeCloseTo(area.y + 300, 0);
  await expect(input).not.toHaveAttribute('placeholder', /./);
  await expect(input).toHaveCSS('border-top-width', '0px');
  await expect(input).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.board-text-toolbar,.board-inspector')).toHaveCount(0);
  await input.fill('Листья опали.\nНаступила осень.');
  await expect(page.locator('.board-inspector')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('inline-writing.png') });
  await input.press('Control+Enter');
  await expect
    .poll(async () => (await scene()).filter((e) => e.customData?.richText && !e.isDeleted).length)
    .toBe(1);
  let text = (await scene()).find((e) => e.customData?.richText && !e.isDeleted)!;
  expect(text.opacity).toBe(100);
  expect(text.customData.osnovaEditingOpacity).toBeUndefined();
  let p = await point(page, text.x + text.width / 2, text.y + text.height / 2);
  await page.mouse.click(p.x, p.y);
  const panel = page.getByRole('complementary', { name: 'Свойства объекта' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Жирный', exact: true }).click();
  await panel.getByLabel('Шрифт текста', { exact: true }).selectOption('literata');
  await expect
    .poll(async () => (await scene()).find((e) => e.id === text.id)?.customData.richText.family)
    .toBe('literata');
  text = (await scene()).find((e) => e.id === text.id)!;
  p = await point(page, text.x + text.width / 2, text.y + text.height / 2);
  await page.mouse.dblclick(p.x, p.y);
  await expect(input).toHaveValue('Листья опали.\nНаступила осень.');
  await expect(panel).toHaveCount(0);
  await input.fill('Текст исправлен.');
  await input.press('Control+Enter');
  await expect
    .poll(async () => (await scene()).find((e) => e.id === text.id)?.customData.richText.text)
    .toBe('Текст исправлен.');
  expect((await scene()).find((e) => e.id === text.id)?.opacity).toBe(100);
  await page.getByRole('button', { name: 'Линии', exact: true }).click();
  await expect(page.getByRole('button', { name: /^(Дуга|Скобка|Уголок) —/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть настройки инструмента', exact: true }).click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await page.getByRole('button', { name: 'Стикеры Эда', exact: true }).click();
  await expect(page.locator('.board-picture-stickers button')).toHaveCount(10);
  expect(await page.locator('.board-picture-stickers').innerText()).toBe('');
  await page.screenshot({ path: info.outputPath('stickers-no-captions.png') });
  await page.getByRole('button', { name: 'Стикер: Эд: есть идея', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.pictureSticker && !e.isDeleted).length,
    )
    .toBe(1);
  const image = (await scene()).find((e) => e.customData?.pictureSticker && !e.isDeleted)!;
  p = await point(page, image.x + image.width / 2, image.y + image.height / 2);
  await page.mouse.click(p.x, p.y);
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Шрифт текста', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Цвет заливки', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Дублировать', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.pictureSticker && !e.isDeleted).length,
    )
    .toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Показать весь холст', exact: true }).click();
  p = await point(page, image.x + image.width / 2, image.y + image.height / 2);
  await page.mouse.click(p.x, p.y);
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const zoom = (await page.locator('.lesson-canvas-zoom').boundingBox())!;
  expect(box.y + box.height).toBeLessThan(zoom.y);
  await page.screenshot({ path: info.outputPath('common-inspector-mobile.png') });
  expect(errors).toEqual([]);
  await context.close();
});
