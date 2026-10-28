import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { loginTeacher, selectPresentation } from './helpers';

async function range(page: Page, value: number) {
  const slider = page.getByRole('slider', { name: 'Толщина пера' });
  await slider.focus();
  await slider.press('Home');
  for (let i = 0.5; i < value; i += 0.5) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(value));
}
async function draw(page: Page, x: number, y: number, dx = 150, dy = 0) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 16 });
  await page.mouse.up();
}

async function scenePoint(page: Page, x: number, y: number) {
  return page.locator('.canvas-paper').evaluate(
    (el, point) => {
      const node = el as HTMLElement,
        box = node.getBoundingClientRect();
      const zoom =
        parseFloat(node.style.backgroundSize) / (node.dataset.background === 'ruled' ? 32 : 24);
      const [px, py] = node.style.backgroundPosition.split(' ').map(parseFloat);
      return { x: box.x + point.x * zoom + px, y: box.y + point.y * zoom + py };
    },
    { x, y },
  );
}

test('custom ink, native 3D figures, subject lines, editable stickers and formulas persist with locks and undo', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const post = async (url: string, data: any) => {
    const r = await request.post(`/api/v1${url}`, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const student = await post('/students', {
    name: 'Демо инструменты',
    grade: '9 класс',
    subject: 'Математика',
  });
  const room = await (await request.get(`/api/v1/classrooms/${student.classroom_id}`)).json();
  const board = await (await request.get(`/api/v1/boards/${room.board_id}`)).json();
  const scene = async () =>
    (await (await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)).json())
      .scene as any[];
  const context = await browser.newContext({
      storageState: await request.storageState(),
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/lesson/${room.id}/prepare`);
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await expect(page.locator('.lesson-room-footer')).toHaveCSS('background-image', 'none');
  await expect(page.getByRole('button', { name: 'Закреплённые объекты', exact: true })).toHaveCount(
    0,
  );
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  await page.getByLabel('Цвет HEX', { exact: true }).fill('#cf3a7a');
  await page.getByLabel('Цвет HEX', { exact: true }).press('Tab');
  await range(page, 7.5);
  await draw(page, area.x + 460, area.y + 300, 150, 20);
  await expect
    .poll(async () => (await scene()).filter((e) => e.type === 'freedraw' && !e.isDeleted).length)
    .toBe(1);
  let ink = (await scene()).find((e) => e.type === 'freedraw' && !e.isDeleted)!;
  expect(ink.strokeColor).toBe('#cf3a7a');
  expect(ink.strokeWidth).toBe(7.5);
  await page.getByRole('button', { name: 'Маркер', exact: true }).click();
  await page.getByLabel('Цвет HEX', { exact: true }).fill('#27b886');
  await page.getByLabel('Цвет HEX', { exact: true }).press('Tab');
  await range(page, 18);
  await draw(page, area.x + 460, area.y + 370);
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.type === 'freedraw' && e.opacity === 30 && !e.isDeleted)
          .length,
    )
    .toBe(1);
  const marker = (await scene()).find((e) => e.type === 'freedraw' && e.opacity === 30)!;
  expect(marker.strokeColor).toBe('#27b886');
  expect(marker.strokeWidth).toBe(18);
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  await expect(page.getByLabel('Цвет HEX', { exact: true })).toHaveValue('#cf3a7a');
  await expect(page.getByRole('slider', { name: 'Толщина пера' })).toHaveValue('7.5');
  await range(page, 2);
  await page.getByRole('button', { name: 'Линии', exact: true }).click();
  await page.getByRole('button', { name: 'Волнистая — Определение', exact: true }).click();
  await draw(page, area.x + 460, area.y + 430, 210);
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.boardLine?.kind === 'wave' && !e.isDeleted)
          .length,
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Линии', exact: true }).click();
  await page.getByRole('button', { name: 'Двойная — Сказуемое', exact: true }).click();
  await draw(page, area.x + 460, area.y + 490, 210, 10);
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.boardLine?.kind === 'double' && !e.isDeleted)
          .length,
    )
    .toBe(2);
  await page.getByRole('button', { name: 'Фигуры', exact: true }).click();
  await page.getByRole('button', { name: 'Объёмные', exact: true }).click();
  await expect(page.getByLabel('Ширина фигуры', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('figures-panel-desktop.png') });
  await page.getByRole('button', { name: 'Фигура: Куб', exact: true }).click();
  await expect(page.locator('.board-tool-panel')).toHaveCount(0);
  const figureCount = (await scene()).filter((e) => !e.isDeleted).length;
  await page.mouse.move(area.x + 460, area.y + 260);
  await page.mouse.down();
  await page.mouse.move(area.x + 680, area.y + 440, { steps: 12 });
  await expect(page.locator('.board-drawing-preview')).toBeVisible();
  expect((await scene()).filter((e) => !e.isDeleted)).toHaveLength(figureCount);
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await scene()).filter(
          (e) => e.customData?.boardFigure?.spec?.kind === 'cube' && !e.isDeleted,
        ).length,
    )
    .toBe(9);
  const originalCube = (await scene()).filter((e) => e.customData?.boardFigure && !e.isDeleted);
  expect(originalCube.every((e) => ['line', 'rectangle'].includes(e.type))).toBeTruthy();
  const front = originalCube.find((e) => e.type === 'rectangle')!;
  await expect(
    page.getByRole('button', { name: 'Закрепить выделенное', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Параметры фигуры', exact: true })).toHaveCount(0);
  // Resize the group's native corner handle, without a numerical settings panel.
  await draw(page, area.x + 688, area.y + 448, 80, 50);
  await expect
    .poll(async () => (await scene()).find((e) => e.id === front.id)?.width)
    .toBeGreaterThan(front.width);
  const resized = (await scene()).find((e) => e.id === front.id)!;
  await page.getByRole('button', { name: 'Отменить действие', exact: true }).click();
  await expect
    .poll(async () => (await scene()).find((e) => e.id === front.id)?.width)
    .toBeCloseTo(front.width, 1);
  await page.getByRole('button', { name: 'Повторить действие', exact: true }).click();
  await expect
    .poll(async () => (await scene()).find((e) => e.id === front.id)?.width)
    .toBeCloseTo(resized.width, 1);
  await page.getByRole('button', { name: 'Закрепить выделенное', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.boardFigure && e.locked && !e.isDeleted).length,
    )
    .toBe(9);
  await page.mouse.click(area.x + 180, area.y + area.height - 120);
  await expect(page.getByRole('toolbar', { name: 'Выделенный объект' })).toHaveCount(0);
  let hit = await scenePoint(page, resized.x, resized.y + resized.height / 2);
  await page.mouse.click(hit.x, hit.y);
  await expect(
    page.getByRole('button', { name: 'Открепить выделенное', exact: true }),
  ).toBeVisible();
  await draw(page, hit.x, hit.y, 60, 30);
  expect((await scene()).find((e) => e.id === front.id)?.x).toBe(resized.x);
  await page.getByRole('button', { name: 'Открепить выделенное', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.boardFigure && e.locked && !e.isDeleted).length,
    )
    .toBe(0);
  // Right-button drag pans at the current zoom and never moves or creates objects.
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click();
  await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click();
  const beforePan = await scenePoint(page, resized.x, resized.y);
  await page.mouse.move(area.x + 800, area.y + 350);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(area.x + 890, area.y + 405, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  const afterPan = await scenePoint(page, resized.x, resized.y);
  expect(afterPan.x - beforePan.x).toBeCloseTo(90, 1);
  expect(afterPan.y - beforePan.y).toBeCloseTo(55, 1);
  expect((await scene()).find((e) => e.id === front.id)?.x).toBe(resized.x);
  expect((await scene()).filter((e) => e.type === 'freedraw' && !e.isDeleted)).toHaveLength(2);
  await expect(page.locator('.context-menu')).toHaveCount(0);
  await expect(page.locator('.board-surface')).not.toHaveClass(/is-panning/);
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Фигуры', exact: true }).click();
  await page.getByRole('button', { name: 'Фигура: Конус', exact: true }).click();
  await page.mouse.move(area.x + 700, area.y + 500);
  await page.mouse.down();
  await page.mouse.move(area.x + 800, area.y + 600);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.board-drawing-preview')).toHaveCount(0);
  expect(
    (await scene()).some((e) => e.customData?.boardFigure?.spec?.kind === 'cone' && !e.isDeleted),
  ).toBe(false);
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await page.getByRole('button', { name: 'Мятный стикер', exact: true }).click();
  await page.getByLabel('Текст стикера', { exact: true }).fill('Условие\nНайдите площадь');
  await page.screenshot({ path: info.outputPath('stickers-panel-desktop.png') });
  await page.getByRole('button', { name: 'Добавить стикер', exact: true }).click();
  await expect
    .poll(async () => (await scene()).filter((e) => e.customData?.sticker && !e.isDeleted).length)
    .toBe(1);
  let note = (await scene()).find((e) => e.customData?.sticker && !e.isDeleted)!;
  expect(note.backgroundColor).toBe('#cdf3e6');
  expect(
    (await scene()).some(
      (e) =>
        e.type === 'text' &&
        e.containerId === note.id &&
        e.originalText === 'Условие\nНайдите площадь',
    ),
  ).toBeTruthy();
  await expect(page.getByLabel('Шрифт текста', { exact: true }).locator('option')).toHaveCount(5);
  for (const font of ['6', '3', '1', '2']) {
    await page.getByLabel('Шрифт текста', { exact: true }).selectOption(font);
    await expect
      .poll(
        async () =>
          (await scene()).find((e) => e.type === 'text' && e.containerId === note.id)?.fontFamily,
      )
      .toBe(Number(font));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`note-font-${font}.png`) });
  }
  await page.getByLabel('Размер текста', { exact: true }).selectOption('28');
  await expect
    .poll(
      async () =>
        (await scene()).find((e) => e.type === 'text' && e.containerId === note.id)?.fontFamily,
    )
    .toBe(2);
  await expect
    .poll(
      async () =>
        (await scene()).find((e) => e.type === 'text' && e.containerId === note.id)?.fontSize,
    )
    .toBe(28);
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  await draw(page, area.x + area.width / 2 - 50, area.y + area.height / 2 + 45, 90, 8);
  await expect
    .poll(
      async () =>
        (await scene()).filter(
          (e) => e.customData?.stickerAnnotation?.stickerId === note.id && !e.isDeleted,
        ).length,
    )
    .toBe(1);
  const noteInk = (await scene()).find(
    (e) => e.customData?.stickerAnnotation?.stickerId === note.id,
  )!;
  await page.getByRole('button', { name: 'Выделение', exact: true }).click();
  await draw(page, area.x + area.width / 2 - 70, area.y + area.height / 2 - 60, 70, 25);
  await expect.poll(async () => (await scene()).find((e) => e.id === note.id)?.x).not.toBe(note.x);
  const movedNote = (await scene()).find((e) => e.id === note.id)!,
    movedInk = (await scene()).find((e) => e.id === noteInk.id)!;
  expect(movedInk.x - noteInk.x).toBeCloseTo(movedNote.x - note.x, 1);
  expect(movedInk.y - noteInk.y).toBeCloseTo(movedNote.y - note.y, 1);
  await page.getByRole('button', { name: 'Формулы', exact: true }).click();
  await page.getByRole('button', { name: 'Физика', exact: true }).click();
  await page.getByLabel('Шаблон формулы', { exact: true }).selectOption({ label: 'Закон Ома' });
  await page.screenshot({ path: info.outputPath('formulas-panel-desktop.png') });
  await page.getByRole('button', { name: 'Добавить формулу', exact: true }).click();
  await expect
    .poll(async () => (await scene()).filter((e) => e.customData?.formula && !e.isDeleted).length)
    .toBe(1);
  await page.getByLabel('Шрифт текста', { exact: true }).selectOption('5');
  await page.getByLabel('Размер текста', { exact: true }).selectOption('36');
  await page.getByRole('button', { name: 'Изменить текст', exact: true }).click();
  await page.getByLabel('Содержимое текста', { exact: true }).fill('I = U / R\nU = 12 В');
  await page.getByRole('button', { name: 'Применить текст', exact: true }).click();
  await expect
    .poll(
      async () => (await scene()).find((e) => e.customData?.formula && !e.isDeleted)?.originalText,
    )
    .toBe('I = U / R\nU = 12 В');
  let formula = (await scene()).find((e) => e.customData?.formula && !e.isDeleted)!;
  expect(formula.fontFamily).toBe(5);
  expect(formula.fontSize).toBe(36);
  await page.getByRole('button', { name: 'Закрепить выделенное', exact: true }).click();
  await expect
    .poll(async () => (await scene()).find((e) => e.id === formula.id)?.locked)
    .toBe(true);
  await page.screenshot({ path: info.outputPath('locked-text-desktop.png') });
  await draw(page, area.x + area.width / 2, area.y + area.height / 2, 70, 30);
  expect((await scene()).find((e) => e.id === formula.id)?.x).toBe(formula.x);
  await page.mouse.click(area.x + 180, area.y + area.height - 120);
  await expect(page.getByRole('toolbar', { name: 'Выделенный объект' })).toHaveCount(0);
  hit = await scenePoint(page, formula.x + formula.width / 2, formula.y + formula.height / 2);
  await page.mouse.click(hit.x, hit.y);
  await expect(
    page.getByRole('button', { name: 'Открепить выделенное', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Открепить выделенное', exact: true }).click();
  await expect
    .poll(async () => (await scene()).find((e) => e.id === formula.id)?.locked)
    .toBe(false);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Меню урока', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Исходные файлы', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Скачать материалы', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Редактируемая сцена .excalidraw' }).click();
  const data = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(data.elements.some((e: any) => e.customData?.boardFigure && !e.isDeleted)).toBeTruthy();
  expect(data.elements.find((e: any) => e.id === formula.id).originalText).toBe(
    'I = U / R\nU = 12 В',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const title of ['Фигуры', 'Линии', 'Стикеры', 'Формулы', 'Текст']) {
    await page.getByRole('button', { name: title, exact: true }).click();
    const panel = (await page.locator('.board-tool-panel').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: info.outputPath(`mobile-${title}.png`) });
    await page.getByRole('button', { name: 'Закрыть настройки инструмента', exact: true }).click();
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  await context.close();
});

test('PDF controls belong to the selected object, also in saved lessons and mobile layouts', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const s = await (
    await request.post('/api/v1/students', { data: { name: 'Демо PDF выбор', subject: 'Физика' } })
  ).json();
  const room = await (await request.get(`/api/v1/classrooms/${s.classroom_id}`)).json();
  const context = await browser.newContext({
      storageState: await request.storageState(),
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/lesson/${room.id}/prepare`);
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 2; i++)
    pdf.addPage([960, 540]).drawText(`Physics ${i + 1}`, { x: 70, y: 400, size: 40 });
  await page.locator('input[type=file][hidden]').setInputFiles({
    name: 'Оптика.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await selectPresentation(page, 'Оптика');
  await expect(page.locator('.lesson-slides button,.lesson-document-pill')).toHaveCount(0);
  const board = await (await request.get(`/api/v1/boards/${room.board_id}`)).json();
  const scene = async () =>
    (await (await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)).json())
      .scene as any[];
  await expect
    .poll(async () => (await scene()).some((e) => e.customData?.presentation && !e.isDeleted))
    .toBe(true);
  const image = (await scene()).find((e) => e.customData?.presentation && !e.isDeleted)!;
  await page.getByRole('button', { name: 'Закрепить выделенное', exact: true }).click();
  await expect.poll(async () => (await scene()).find((e) => e.id === image.id)?.locked).toBe(true);
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  await page.mouse.click(area.x + 180, area.y + area.height - 120);
  await expect(page.getByRole('toolbar', { name: 'Выделенный объект' })).toHaveCount(0);
  const hit = await scenePoint(page, image.x + image.width / 2, image.y + image.height / 2);
  await page.mouse.click(hit.x, hit.y);
  await expect(
    page.getByRole('button', { name: 'Открепить выделенное', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Открепить выделенное', exact: true }).click();
  await expect.poll(async () => (await scene()).find((e) => e.id === image.id)?.locked).toBe(false);
  await page.getByRole('button', { name: 'Следующий слайд: Оптика', exact: true }).click();
  await expect(page.getByLabel('Слайд презентации Оптика')).toHaveValue('1');
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  await expect(page.locator('.presentation-controls')).toHaveCount(0);
  await selectPresentation(page, 'Оптика');
  await expect(page.locator('.presentation-controls')).toBeVisible();
  await page.screenshot({ path: info.outputPath('selected-presentation-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await selectPresentation(page, 'Оптика');
  const control = (await page.locator('.presentation-controls').boundingBox())!;
  expect(control.x).toBeGreaterThanOrEqual(0);
  expect(control.x + control.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Предыдущий слайд: Оптика', exact: true }).click();
  await expect(page.getByLabel('Слайд презентации Оптика')).toHaveValue('0');
  await page.screenshot({ path: info.outputPath('selected-presentation-mobile.png') });
  expect(errors).toEqual([]);
  await context.close();
});
