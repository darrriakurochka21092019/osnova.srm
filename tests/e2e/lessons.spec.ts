import { test, expect, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { loginTeacher, selectPresentation, addNote } from './helpers';

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBeTruthy();
}

test('one student link covers preparation, waiting, a shared lesson, comments, summary and saved presentation', async ({
  browser,
  request,
}, testInfo) => {
  await loginTeacher(request);
  const errors: string[] = [];
  const post = async (url: string, data: any) => {
    const r = await request.post(`/api/v1${url}`, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const teacher = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1440, height: 1000 },
  });
  const page = await teacher.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/students');
  await page.getByRole('button', { name: 'Добавить ученика', exact: true }).first().click();
  await page.getByLabel('Имя ученика', { exact: true }).fill('Демо Алексей');
  await page.getByLabel('Класс', { exact: true }).fill('8 класс');
  await page.getByLabel('Предмет', { exact: true }).fill('Математика');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const students = await (await request.get('/api/v1/students')).json();
  const student = students.find((s: any) => s.name === 'Демо Алексей');
  expect(student.classroom_id).toBeTruthy();
  const room = await (await request.get(`/api/v1/classrooms/${student.classroom_id}`)).json();
  const board = await (await request.get(`/api/v1/boards/${room.board_id}`)).json();
  const planned = await post('/records/lesson', {
    studentId: student.id,
    data: {
      title: 'Квадратные уравнения',
      start: new Date(Date.now() + 600000).toISOString(),
      duration: 60,
      price: 1500,
      status: 'planned',
      subject: 'Математика',
    },
  });
  await post('/records/lesson', {
    studentId: student.id,
    data: {
      title: 'Проверяем корни',
      start: new Date(Date.now() + 7 * 86400000).toISOString(),
      duration: 60,
      price: 1500,
      status: 'planned',
      subject: 'Математика',
    },
  });
  const scene = async () =>
    (await (await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)).json())
      .scene as any[];
  await page.goto(`/lesson/${room.id}/prepare?lesson=${planned.id}`);
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  const pdf = await PDFDocument.create();
  for (const text of ['Quadratic equations', 'Check the roots']) {
    const p = pdf.addPage([960, 540]);
    p.drawText(text, { x: 70, y: 420, size: 34 });
    p.drawText('x2 - 5x + 6 = 0', { x: 70, y: 320, size: 28 });
  }
  await page.locator('.lesson-embedded input[type=file]').setInputFiles({
    name: 'Уравнения.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await selectPresentation(page, 'Уравнения');
  await expect(page.getByLabel('Слайд презентации Уравнения')).toHaveValue('0');
  await expect(page.locator('.lesson-save')).toContainText('Все изменения сохранены');
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  const area = await page.locator('.lesson-board-area').boundingBox();
  const pen = await teacher.newCDPSession(page);
  const x = area!.x + area!.width * 0.45,
    y = area!.y + area!.height * 0.5;
  const penEvent = (type: string, px: number, py: number) =>
    pen.send('Input.dispatchMouseEvent', {
      type: type as any,
      x: px,
      y: py,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      pointerType: 'pen',
      force: type === 'mouseReleased' ? 0 : 0.65,
    });
  await penEvent('mousePressed', x, y);
  for (let i = 1; i <= 12; i++) await penEvent('mouseMoved', x + i * 5, y + i * 2);
  await penEvent('mouseReleased', x + 60, y + 24);
  await expect
    .poll(async () => (await scene()).filter((e) => e.type === 'freedraw' && !e.isDeleted).length)
    .toBe(1);
  await pen.detach();
  await selectPresentation(page, 'Уравнения');
  await page.getByRole('button', { name: 'Следующий слайд: Уравнения', exact: true }).click();
  await addNote(page);
  await expect
    .poll(async () => (await scene()).filter((e) => e.type === 'text' && !e.isDeleted).length)
    .toBe(1);
  await page.getByRole('button', { name: 'Отменить действие', exact: true }).click();
  await expect
    .poll(async () => (await scene()).filter((e) => e.type === 'text' && !e.isDeleted).length)
    .toBe(0);
  await page.getByRole('button', { name: 'Повторить действие', exact: true }).click();
  await expect
    .poll(async () => (await scene()).filter((e) => e.type === 'text' && !e.isDeleted).length)
    .toBe(1);

  const studentContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await studentContext.addInitScript(() => {
    (window as any).__mediaRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as any).__mediaRequests++;
      throw new Error('Video must stay a placeholder');
    };
  });
  const pupil = await studentContext.newPage();
  pupil.on('pageerror', (e) => errors.push(e.message));
  await pupil.goto(room.link);
  await expect(pupil.getByRole('heading', { name: 'Готовы начать?' })).toBeVisible();
  await expect(pupil.getByText('Место для видеосвязи', { exact: true })).toBeVisible();
  await pupil.screenshot({ path: testInfo.outputPath('lesson-entry-desktop.png'), fullPage: true });
  await pupil.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow(pupil);
  await pupil.screenshot({ path: testInfo.outputPath('lesson-entry-mobile.png'), fullPage: true });
  await pupil.getByLabel('Как вас видят участники').fill('Алексей');
  await pupil.getByRole('button', { name: 'Войти на урок', exact: true }).click();
  await expect(pupil.getByRole('heading', { name: 'Ожидаем преподавателя' })).toBeVisible();
  await page.goto(`/lesson/${room.id}?lesson=${planned.id}`);
  await expect(page.getByText('Алексей уже в комнате', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('lesson-teacher-entry.png'), fullPage: true });
  await page.getByRole('button', { name: 'Войти на урок', exact: true }).click();
  await expect(page.locator('.lesson-workspace')).toBeVisible();
  await expect(pupil.locator('.lesson-workspace')).toBeVisible();
  await expect(page.locator('.lesson-sidebar-head')).toContainText('2');
  await pupil.getByRole('button', { name: 'Чат', exact: true }).click();
  await pupil.getByRole('textbox', { name: 'Комментарий к уроку' }).fill('Почему здесь два корня?');
  await pupil.getByRole('button', { name: 'Отправить комментарий', exact: true }).click();
  await expect(page.locator('.lesson-chat-message')).toContainText('Почему здесь два корня?');
  await pupil.getByRole('button', { name: 'Скрыть панель участников', exact: true }).click();
  await pupil.getByRole('button', { name: 'Поднять руку', exact: true }).click();
  await expect(page.locator('.lesson-raised-hand')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('lesson-workspace-desktop.png') });
  await noHorizontalOverflow(pupil);
  await pupil.screenshot({ path: testInfo.outputPath('lesson-workspace-mobile.png') });
  await page.getByRole('button', { name: 'Ссылка на занятие', exact: true }).click();
  await expect(page.getByLabel('Постоянная ссылка на занятия')).toHaveValue(room.link);
  await page.getByLabel(`Права: ${student.name}`, { exact: true }).selectOption('view');
  await expect(pupil.getByRole('button', { name: 'Ручка', exact: true })).toBeDisabled();
  await page.getByLabel(`Права: ${student.name}`, { exact: true }).selectOption('edit');
  await expect(pupil.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await studentContext.setOffline(true);
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Урок завершён', exact: true })).toBeVisible();
  await studentContext.setOffline(false);
  await expect(pupil.getByRole('heading', { name: 'Урок завершён', exact: true })).toBeVisible();
  const sessionId = page.url().split('/').at(-1)!;
  await page
    .getByLabel('Что прошли на уроке')
    .fill('Решили квадратное уравнение\nПроверили оба корня');
  await page
    .getByLabel('Личная заметка к следующему уроку')
    .fill('Личная заметка: повторить дискриминант');
  await page.getByRole('button', { name: 'Сохранить итоги', exact: true }).click();
  await expect(pupil.getByText('Решили квадратное уравнение', { exact: true })).toBeVisible();
  await expect(pupil.getByText('Личная заметка: повторить дискриминант')).toHaveCount(0);
  await page.getByRole('button', { name: 'Назначить задание', exact: true }).click();
  await page.getByLabel('Название задания', { exact: true }).fill('Проверка корней');
  await page
    .getByLabel('Что нужно сделать', { exact: true })
    .fill('Решить три уравнения и проверить корни.');
  await page.getByRole('button', { name: 'Назначить задание', exact: true }).click();
  await expect(page.getByRole('link', { name: /Проверка корней/ })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('lesson-summary-desktop.png'),
    fullPage: true,
  });
  await pupil.screenshot({
    path: testInfo.outputPath('lesson-summary-mobile.png'),
    fullPage: true,
  });
  await pupil.goto(`/lesson/${room.id}/materials/${sessionId}`);
  await expect(pupil.getByRole('button', { name: 'Ручка', exact: true })).toBeDisabled();
  await selectPresentation(pupil, 'Уравнения');
  await expect(
    pupil.getByRole('button', { name: 'Предыдущий слайд: Уравнения', exact: true }),
  ).toBeEnabled();
  await pupil.getByRole('button', { name: 'Предыдущий слайд: Уравнения', exact: true }).click();
  await expect(pupil.getByLabel('Слайд презентации Уравнения')).toHaveValue('0');
  expect(
    (await scene()).find((e) => e.customData?.presentation)?.customData.presentation.slideIndex,
  ).toBe(1);
  await pupil.setViewportSize({ width: 740, height: 430 });
  await selectPresentation(pupil, 'Уравнения');
  await expect(pupil.getByLabel('Слайд презентации Уравнения')).toBeVisible();
  await pupil.getByLabel('Слайд презентации Уравнения').selectOption('1');
  await noHorizontalOverflow(pupil);
  await pupil.screenshot({ path: testInfo.outputPath('lesson-materials-landscape.png') });
  await pupil.setViewportSize({ width: 390, height: 844 });
  await pupil.goto(room.link);
  await expect(pupil.getByRole('heading', { name: 'Проверяем корни', exact: true })).toBeVisible();
  expect(await pupil.evaluate(() => (window as any).__mediaRequests)).toBe(0);
  await request.post(`/api/v1/classrooms/${room.id}/link`, { data: { rotate: true } });
  await pupil.goto(room.link);
  await expect(
    pupil.getByRole('heading', { name: 'Это приглашение недействительно', exact: true }),
  ).toBeVisible();
  await pupil.screenshot({
    path: testInfo.outputPath('lesson-invalid-mobile.png'),
    fullPage: true,
  });
  await noHorizontalOverflow(pupil);
  expect(errors).toEqual([]);
  await teacher.close();
  await studentContext.close();
});

test('three personal links enter one mini-group with four real participants and a safe history preview', async ({
  browser,
  request,
}, testInfo) => {
  await loginTeacher(request);
  const errors: string[] = [];
  const post = async (url: string, data: any) => {
    const r = await request.post(`/api/v1${url}`, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const students = [];
  for (const name of ['Демо Саша', 'Демо Миша', 'Демо Таня'])
    students.push(await post('/students', { name, grade: '9 класс', subject: 'Физика' }));
  const lesson = await post('/records/lesson', {
    studentId: students[0].id,
    data: {
      title: 'Закон сохранения энергии',
      start: new Date(Date.now() + 60000).toISOString(),
      duration: 60,
      price: 0,
      status: 'planned',
      studentIds: students.slice(1).map((s) => s.id),
      subject: 'Физика',
    },
  });
  const room = await post(`/lessons/${lesson.id}/classroom`, {});
  expect(room.kind).toBe('group');
  expect(room.link).toBeUndefined();
  expect(room.memberLinks).toHaveLength(3);
  const teacher = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1440, height: 1000 },
  });
  const page = await teacher.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/lesson/${room.id}?lesson=${lesson.id}`);
  await page.getByRole('button', { name: 'Войти на урок', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  const pupils = [];
  for (const student of students) {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } }),
      pupil = await context.newPage();
    pupil.on('pageerror', (e) => errors.push(e.message));
    const link = room.memberLinks.find((l: any) => l.studentId === student.id);
    await pupil.goto(link.url);
    await expect(pupil.getByLabel('Как вас видят участники')).toHaveValue(student.name);
    await pupil.getByRole('button', { name: 'Войти на урок', exact: true }).click();
    await expect(pupil.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
    expect(pupil.url()).toContain(`/lesson/${room.id}/live/`);
    pupils.push({ context, page: pupil });
  }
  await expect(page.locator('.lesson-sidebar-head')).toContainText('4');
  await expect(page.locator('.lesson-person-card')).toHaveCount(4);
  await pupils[2].page.getByRole('button', { name: 'Поднять руку', exact: true }).click();
  await expect(page.locator('.lesson-raised-hand')).toBeVisible();
  await request.patch(`/api/v1/classrooms/${room.id}/members/${students[0].id}`, {
    data: { permission: 'view' },
  });
  await expect(pupils[0].page.getByRole('button', { name: 'Ручка', exact: true })).toBeDisabled();
  await expect(pupils[1].page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await addNote(pupils[1].page);
  const board = await (await request.get(`/api/v1/boards/${room.board_id}`)).json();
  await expect
    .poll(
      async () =>
        (
          await (await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)).json()
        ).scene.filter((e: any) => e.type === 'text' && !e.isDeleted).length,
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Комментарии', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('lesson-mini-group-desktop.png') });
  await page.setViewportSize({ width: 800, height: 900 });
  const materials = await page.locator('.lesson-slides').boundingBox(),
    controls = await page.locator('.lesson-call-controls').boundingBox();
  expect(materials!.x + materials!.width).toBeLessThanOrEqual(controls!.x);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('lesson-mini-group-tablet.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'Ссылка на занятие', exact: true }).click();
  await expect(page.locator('.lesson-personal-link')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('lesson-mini-group-access.png') });
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Меню урока', exact: true }).click();
  await page.getByRole('button', { name: 'История уроков', exact: true }).click();
  const previous = await (
    await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)
  ).json();
  await page.getByRole('button', { name: /Перед уроком/ }).click();
  await expect(page.locator('.lesson-preview-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeDisabled();
  expect(
    (await (await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)).json()).revision,
  ).toBe(previous.revision);
  await page.screenshot({ path: testInfo.outputPath('lesson-history-preview-desktop.png') });
  await page.getByRole('button', { name: 'Вернуться к текущей', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  for (const pupil of pupils) {
    await expect(
      pupil.page.getByRole('heading', { name: 'Урок завершён', exact: true }),
    ).toBeVisible();
    await noHorizontalOverflow(pupil.page);
    await pupil.context.close();
  }
  expect(errors).toEqual([]);
  await teacher.close();
});
