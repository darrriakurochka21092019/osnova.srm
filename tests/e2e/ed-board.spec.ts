import { expect, test } from '@playwright/test';
import { loginTeacher } from './helpers';

test('tool popovers, formatted inline text and the supplied sticker pack save and reopen', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const student = await (
    await request.post('/api/v1/students', {
      data: { name: 'Демо новые панели', subject: 'Русский язык' },
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
  await expect(page.locator('.lesson-color-tools')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Настройки ручки', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Толщина пера', exact: true })).toHaveAttribute(
    'max',
    '6',
  );
  await page.getByRole('button', { name: 'Любой цвет', exact: true }).click();
  await page.getByLabel('Цвет HEX', { exact: true }).fill('#c93472');
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  await page.mouse.move(area.x + 750, area.y + 300);
  await page.mouse.down();
  await page.mouse.move(area.x + 950, area.y + 320, { steps: 16 });
  await page.mouse.up();
  await expect
    .poll(async () => (await scene()).filter((e) => e.type === 'freedraw' && !e.isDeleted).length)
    .toBe(1);
  const ink = (await scene()).find((e) => e.type === 'freedraw' && !e.isDeleted)!;
  expect(ink.strokeColor).toBe('#c93472');
  expect(ink.strokeWidth).toBeCloseTo(2 / 4.25, 4);
  expect(ink.customData.inkTool).toBe('pen');
  await page.getByRole('button', { name: 'Маркер', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Толщина маркера', exact: true })).toHaveAttribute(
    'max',
    '24',
  );
  await page.getByRole('slider', { name: 'Прозрачность инструмента', exact: true }).fill('50');
  await page.getByRole('button', { name: 'Закрыть настройки инструмента', exact: true }).click();
  await page.mouse.move(area.x + 750, area.y + 360);
  await page.mouse.down();
  await page.mouse.move(area.x + 950, area.y + 380, { steps: 16 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await scene()).find(
          (e) => e.type === 'freedraw' && e.customData?.inkTool === 'marker' && !e.isDeleted,
        )?.opacity,
    )
    .toBe(50);
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  await expect(
    page.getByRole('slider', { name: 'Прозрачность инструмента', exact: true }),
  ).toHaveValue('100');
  await page.getByRole('button', { name: 'Закрыть настройки инструмента', exact: true }).click();
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  await page.mouse.click(area.x + 420, area.y + 300);
  const input = page.getByRole('textbox', { name: 'Текст на доске', exact: true });
  await expect(input).toBeVisible();
  await input.fill('Листья, опавшие с деревьев,\nпокрыли дорожку.');
  await page.getByLabel('Шрифт текста', { exact: true }).selectOption('literata');
  await page.getByRole('button', { name: 'Жирный', exact: true }).click();
  await page.getByRole('button', { name: 'Курсив', exact: true }).click();
  await page.getByRole('button', { name: 'Подчёркнутый', exact: true }).click();
  await page.getByRole('button', { name: 'По центру', exact: true }).click();
  await input.press('Control+Enter');
  await expect
    .poll(
      async () =>
        (await scene()).find((e) => e.customData?.richText && !e.isDeleted)?.customData.richText
          .family,
    )
    .toBe('literata');
  const text = (await scene()).find((e) => e.customData?.richText && !e.isDeleted)!;
  expect(text.customData.richText).toMatchObject({
    bold: true,
    italic: true,
    underline: true,
    align: 'center',
  });
  await page.screenshot({ path: info.outputPath('formatted-text.png') });
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await page.getByRole('button', { name: 'Мятный стикер', exact: true }).click();
  await expect(input).toBeVisible();
  await input.fill('Что изменилось?');
  await input.press('Control+Enter');
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.richText?.containerId && !e.isDeleted).length,
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await page.getByRole('button', { name: 'Стикеры Эда', exact: true }).click();
  await expect(page.locator('.board-picture-stickers button')).toHaveCount(10);
  await page.getByRole('button', { name: 'Стикер: Эд: есть идея', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.pictureSticker && !e.isDeleted).length,
    )
    .toBe(1);
  const picture = (await scene()).find((e) => e.customData?.pictureSticker && !e.isDeleted)!;
  await page.getByRole('menuitem', { name: 'На задний план', exact: true }).click();
  await expect
    .poll(async () => (await scene()).filter((e) => !e.isDeleted)[0]?.id)
    .toBe(picture.id);
  await page.getByRole('button', { name: 'Действия с объектом', exact: true }).click();
  await page.getByRole('menuitem', { name: 'На передний план', exact: true }).click();
  await expect
    .poll(async () => (await scene()).filter((e) => !e.isDeleted).at(-1)?.id)
    .toBe(picture.id);
  await page.getByRole('button', { name: 'Действия с объектом', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Дублировать', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.pictureSticker && !e.isDeleted).length,
    )
    .toBe(2);
  await page.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await scene()).filter((e) => e.customData?.pictureSticker && !e.isDeleted).length,
    )
    .toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await expect(page.getByText('Некорректные координаты', { exact: true })).toHaveCount(0);
  expect((await scene()).find((e) => e.id === text.id)?.customData.richText.text).toContain(
    'Листья',
  );
  expect(errors).toEqual([]);
  await context.close();
});

test('download options export real artwork and lesson completion requires saved confirmation', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const s = await (
    await request.post('/api/v1/students', { data: { name: 'Демо экспорт', subject: 'Физика' } })
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
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  await page.mouse.click(area.x + 380, area.y + 240);
  const input = page.getByRole('textbox', { name: 'Текст на доске', exact: true });
  await input.fill('Площадь круга: S = πr²');
  await input.press('Control+Enter');
  await expect(page.locator('.lesson-save')).toContainText('Все изменения сохранены');
  await page.getByRole('button', { name: 'Начать урок', exact: true }).click();
  await expect(page).toHaveURL(/\/live\//);
  const pupilContext = await browser.newContext(),
    pupil = await pupilContext.newPage();
  await pupil.goto(room.link);
  await pupil.getByRole('button', { name: 'Войти на урок', exact: true }).click();
  await expect(pupil.locator('.lesson-workspace')).toBeVisible();
  // A different participant sees and can edit the same stored text model.
  await pupil.getByRole('button', { name: 'Показать весь холст', exact: true }).click();
  const pupilCanvas = pupil.locator('.board-surface canvas.excalidraw__canvas.interactive');
  await expect(pupilCanvas).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Комментарий к уроку' })
    .fill('Проверили формулу площади.');
  await page.getByRole('button', { name: 'Отправить комментарий', exact: true }).click();
  await page.getByRole('button', { name: 'Меню урока', exact: true }).click();
  await page.getByRole('button', { name: 'Скачать материалы', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Скачать доску', exact: true });
  await expect(dialog.getByAltText('Предпросмотр доски')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактируемая сцена .excalidraw' })).toHaveCount(
    0,
  );
  await page.getByLabel('Формат листа', { exact: true }).selectOption('a3');
  await page.getByLabel('Ориентация листа', { exact: true }).selectOption('portrait');
  await expect(page.getByLabel('Включить комментарии (1)')).toBeChecked();
  await page.screenshot({ path: info.outputPath('export-desktop.png') });
  const pdfDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Скачать', exact: true }).click();
  const { readFile } = await import('node:fs/promises'),
    { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(await readFile((await (await pdfDownload).path())!));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(841.89, 1);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(1190.55, 1);
  await page.getByRole('button', { name: 'Меню урока', exact: true }).click();
  await page.getByRole('button', { name: 'Скачать материалы', exact: true }).click();
  await dialog.getByRole('radio', { name: 'PNG', exact: true }).click();
  const pngDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Скачать', exact: true }).click();
  const pngResult = await pngDownload;
  await pngResult.saveAs(info.outputPath('board-export.png'));
  const png = await readFile((await pngResult.path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const sessionId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Завершить урок?', exact: true })).toBeVisible();
  expect(
    (await (await request.get(`/api/v1/classrooms/${room.id}/sessions/${sessionId}`)).json())
      .session.ended_at,
  ).toBeNull();
  await page.screenshot({ path: info.outputPath('end-lesson-desktop.png') });
  await page.getByRole('button', { name: 'Продолжить урок', exact: true }).click();
  await expect(page).toHaveURL(/\/live\//);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page.screenshot({ path: info.outputPath('end-lesson-mobile.png') });
  await page.getByRole('button', { name: 'Завершить урок', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Урок завершён', exact: true })).toBeVisible();
  await expect(pupil.getByRole('heading', { name: 'Урок завершён', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await pupilContext.close();
  await context.close();
});

test('unfinished formatted text recovers from the offline draft and clearing it removes the object', async ({
  browser,
  request,
}) => {
  await loginTeacher(request);
  const s = await (
      await request.post('/api/v1/students', { data: { name: 'Демо черновик текста' } })
    ).json(),
    room = await (await request.get(`/api/v1/classrooms/${s.classroom_id}`)).json(),
    board = await (await request.get(`/api/v1/boards/${room.board_id}`)).json();
  const context = await browser.newContext({
      storageState: await request.storageState(),
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.goto(`/lesson/${room.id}/prepare`);
  await expect(page.getByRole('button', { name: 'Текст', exact: true })).toBeEnabled();
  await page.route('**/api/v1/pages/*/operations', (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  await page.mouse.click(area.x + 420, area.y + 260);
  const input = page.getByRole('textbox', { name: 'Текст на доске', exact: true });
  await input.fill('Сохранить незавершённую мысль');
  await page.getByRole('button', { name: 'Жирный', exact: true }).click();
  await expect(page.locator('.lesson-save')).toContainText('Нет связи');
  await page.reload();
  await expect(input).toHaveValue('Сохранить незавершённую мысль');
  await page.unroute('**/api/v1/pages/*/operations');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await input.press('Control+Enter');
  await expect(page.locator('.lesson-save')).toContainText('Все изменения сохранены');
  const scene = async () =>
    (await (await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)).json())
      .scene as any[];
  const text = (await scene()).find((e) => e.customData?.richText && !e.isDeleted)!;
  expect(text.customData.richText.bold).toBe(true);
  await page.getByRole('button', { name: 'Изменить текст', exact: true }).click();
  await input.fill('');
  await input.press('Control+Enter');
  await expect
    .poll(async () => (await scene()).find((e) => e.id === text.id)?.isDeleted)
    .toBe(true);
  await expect(page.locator('.lesson-save')).toContainText('Все изменения сохранены');
  await context.close();
});
