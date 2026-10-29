import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { loginTeacher, selectPresentation } from './helpers';

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

test('figures, subject lines, notes and formulas retain native editing, locking and undo', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const student = await (
    await request.post('/api/v1/students', {
      data: { name: 'Демо инструменты', subject: 'Математика' },
    })
  ).json();
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
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  await expect(page.locator('.lesson-color-tools')).toHaveCount(0);
  await expect(page.locator('.lesson-room-footer')).toHaveCSS('background-image', 'none');
  for (const [label, kind, count, y] of [
    ['Волнистая — Определение', 'wave', 1, 430],
    ['Двойная — Сказуемое', 'double', 2, 490],
  ] as const) {
    await page.getByRole('button', { name: 'Линии', exact: true }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await draw(page, area.x + 600, area.y + y, 210, 10);
    await expect
      .poll(
        async () =>
          (await scene()).filter((e) => e.customData?.boardLine?.kind === kind && !e.isDeleted)
            .length,
      )
      .toBe(count);
  }
  await page.getByRole('button', { name: 'Фигуры', exact: true }).click();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByLabel('Ширина фигуры', { exact: true })).toHaveCount(0);
  const gallery = (await page
    .getByRole('dialog', { name: 'Галерея фигур', exact: true })
    .boundingBox())!;
  expect(gallery.x).toBeLessThan(150);
  await page.screenshot({ path: info.outputPath('figures-panel-desktop.png') });
  await page.getByRole('button', { name: 'Фигура: Куб', exact: true }).click();
  await page.mouse.move(area.x + 600, area.y + 260);
  await page.mouse.down();
  await page.mouse.move(area.x + 820, area.y + 440, { steps: 12 });
  await expect(page.locator('.board-drawing-preview')).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await scene()).filter(
          (e) => e.customData?.boardFigure?.spec?.kind === 'cube' && !e.isDeleted,
        ).length,
    )
    .toBe(9);
  const cube = (await scene()).filter((e) => e.customData?.boardFigure && !e.isDeleted),
    front = cube.find((e) => e.type === 'rectangle')!;
  await page.getByRole('menuitem', { name: 'Закрепить', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.boardFigure && e.locked && !e.isDeleted).length,
    )
    .toBe(9);
  await page.mouse.click(area.x + 200, area.y + 650);
  const hit = await scenePoint(page, front.x, front.y + front.height / 2);
  await page.mouse.click(hit.x, hit.y);
  await expect(page.getByRole('menuitem', { name: 'Открепить', exact: true })).toBeVisible();
  await draw(page, hit.x, hit.y, 60, 30);
  expect((await scene()).find((e) => e.id === front.id)?.x).toBe(front.x);
  await page.getByRole('menuitem', { name: 'Открепить', exact: true }).click();
  await expect.poll(async () => (await scene()).find((e) => e.id === front.id)?.locked).toBe(false);
  await page.getByRole('button', { name: 'Действия с объектом', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Дублировать', exact: true }).click();
  await expect
    .poll(
      async () => (await scene()).filter((e) => e.customData?.boardFigure && !e.isDeleted).length,
    )
    .toBe(18);
  await page.getByRole('button', { name: 'Отменить действие', exact: true }).click();
  await expect
    .poll(
      async () => (await scene()).filter((e) => e.customData?.boardFigure && !e.isDeleted).length,
    )
    .toBe(9);
  await page.getByRole('button', { name: 'Повторить действие', exact: true }).click();
  await expect
    .poll(
      async () => (await scene()).filter((e) => e.customData?.boardFigure && !e.isDeleted).length,
    )
    .toBe(18);
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть настройки инструмента', exact: true }).click();
  const before = await scenePoint(page, front.x, front.y);
  await page.mouse.move(area.x + 850, area.y + 350);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(area.x + 940, area.y + 405, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  const after = await scenePoint(page, front.x, front.y);
  expect(after.x - before.x).toBeCloseTo(90, 1);
  expect(after.y - before.y).toBeCloseTo(55, 1);
  expect((await scene()).filter((e) => e.type === 'freedraw' && !e.isDeleted)).toHaveLength(0);
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await page.getByRole('button', { name: 'Мятный стикер', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Текст на доске', exact: true });
  await input.fill('Условие\nНайдите площадь');
  await input.press('Control+Enter');
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.richText?.containerId && !e.isDeleted).length,
    )
    .toBe(1);
  const note = (await scene()).find((e) => e.customData?.sticker && !e.isDeleted)!;
  expect(note.backgroundColor).toBe('#cdf3e6');
  for (const font of ['onest', 'unbounded', 'literata', 'caveat', 'pt-mono']) {
    await page.getByLabel('Шрифт текста', { exact: true }).selectOption(font);
    await expect
      .poll(
        async () =>
          (await scene()).find(
            (e) => e.customData?.richText?.containerId === note.id && !e.isDeleted,
          )?.customData.richText.family,
      )
      .toBe(font);
  }
  await page.getByLabel('Размер текста', { exact: true }).selectOption('28');
  await expect
    .poll(
      async () =>
        (await scene()).find((e) => e.customData?.richText?.containerId === note.id)?.customData
          .richText.fontSize,
    )
    .toBe(28);
  await page.getByRole('button', { name: 'Формулы', exact: true }).click();
  await page.getByRole('button', { name: 'Физика', exact: true }).click();
  await page.getByLabel('Шаблон формулы', { exact: true }).selectOption({ label: 'Закон Ома' });
  await page.getByRole('button', { name: 'Добавить формулу', exact: true }).click();
  await expect
    .poll(async () => (await scene()).filter((e) => e.customData?.formula && !e.isDeleted).length)
    .toBe(1);
  await page.getByRole('button', { name: 'Изменить текст', exact: true }).click();
  await input.fill('I = U / R\nU = 12 В');
  await input.press('Control+Enter');
  await expect
    .poll(
      async () =>
        (await scene()).find((e) => e.customData?.formula && !e.isDeleted)?.customData.richText
          .text,
    )
    .toBe('I = U / R\nU = 12 В');
  await page.getByRole('button', { name: 'Действия с объектом', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Закрепить', exact: true }).click();
  const formula = (await scene()).find((e) => e.customData?.formula && !e.isDeleted)!;
  await expect
    .poll(async () => (await scene()).find((e) => e.id === formula.id)?.locked)
    .toBe(true);
  await page.getByRole('button', { name: 'Действия с объектом', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Открепить', exact: true }).click();
  await expect
    .poll(async () => (await scene()).find((e) => e.id === formula.id)?.locked)
    .toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const title of ['Ручка', 'Маркер', 'Фигуры', 'Линии', 'Стикеры', 'Формулы']) {
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
  await page.getByRole('menuitem', { name: 'Закрепить', exact: true }).click();
  await expect.poll(async () => (await scene()).find((e) => e.id === image.id)?.locked).toBe(true);
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  await page.mouse.click(area.x + 180, area.y + area.height - 120);
  await expect(page.getByRole('menu', { name: 'Действия с объектом' })).toHaveCount(0);
  const hit = await scenePoint(page, image.x + image.width / 2, image.y + image.height / 2);
  await page.mouse.click(hit.x, hit.y);
  await expect(page.getByRole('menuitem', { name: 'Открепить', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Открепить', exact: true }).click();
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
