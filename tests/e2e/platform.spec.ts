import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

test('teacher and student complete a lesson, collaborate, recover offline edits, import PDF and submit work', async ({
  browser,
  request,
}, testInfo) => {
  const errors: string[] = [];
  const post = async (url: string, data: any) => {
    const r = await request.post(`/api/v1${url}`, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  await post('/auth/setup', {
    name: 'Демо-преподаватель',
    email: 'teacher@example.test',
    password: 'teacher-test-password',
  });
  await request.patch('/api/v1/me', { data: { settings: { onboardingComplete: true } } });
  const a = await post('/students', {
    name: 'Демо-ученик А',
    grade: '9 класс',
    goal: 'Разобраться в синтаксисе',
    program: '1. Грамматическая основа\n2. Сложное предложение',
  });
  const b = await post('/students', { name: 'Демо-ученик Б', grade: '11 класс', color: 'mint' });
  const board = await post('/boards', { title: 'Синтаксис · учебная доска', studentId: a.id });
  const boardDetails = await (await request.get(`/api/v1/boards/${board.id}`)).json();
  const pageId = boardDetails.pages[0].id;
  const hw = await post('/records/homework', {
    studentId: a.id,
    data: {
      title: 'Разбор сложного предложения',
      description: 'Выделите грамматические основы и объясните запятые.',
      due: new Date(Date.now() + 86400000).toISOString(),
      status: 'assigned',
      maxScore: 10,
    },
  });
  await post('/records/report', {
    studentId: a.id,
    data: {
      title: 'Итоги учебного месяца',
      month: new Date().toISOString().slice(0, 7),
      summary: 'Учимся объяснять выбор запятой.',
      plan: 'Продолжить работу со сложными предложениями.',
      shared: true,
    },
  });
  const now = new Date().toISOString();
  await post('/records/lesson', {
    studentId: a.id,
    data: {
      title: 'Проведённый урок',
      start: now,
      duration: 60,
      price: 1500,
      status: 'completed',
      boardId: board.id,
    },
  });
  await post('/records/lesson', {
    studentId: a.id,
    data: { title: 'Отменённый урок', start: now, duration: 60, price: 1500, status: 'cancelled' },
  });
  await post('/records/transaction', {
    studentId: a.id,
    data: { title: 'Оплата занятий', date: now, type: 'payment', amount: 1000 },
  });
  const accountInvite = await post(`/students/${a.id}/invite`, {});
  const guestInvite = await post(`/boards/${board.id}/invites`, {
    permission: 'edit',
    hours: 24,
    maxUses: 4,
  });
  const teacher = await browser.newContext({
      storageState: await request.storageState(),
      viewport: { width: 1440, height: 1000 },
    }),
    page = await teacher.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Хорошего дня/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop-dashboard.png'), fullPage: true });
  await page.goto(`/board/${board.id}`);
  await expect(page.locator('.excalidraw')).toBeVisible();
  await page.getByRole('button', { name: 'Русский язык' }).click();
  await page.getByRole('button', { name: 'Большой текст', exact: true }).click();
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  const scene1 = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
  expect(scene1.scene.some((e: any) => e.type === 'text')).toBeTruthy();
  const guest = await browser.newContext(),
    guestPage = await guest.newPage();
  guestPage.on('pageerror', (e) => errors.push(e.message));
  await guestPage.goto(guestInvite.url.replace('http://localhost:5173', 'http://127.0.0.1:4173'));
  await guestPage.getByLabel('Ваше имя', { exact: true }).fill('Демо-гость');
  await guestPage.getByRole('button', { name: 'Открыть доску', exact: true }).click();
  await expect(guestPage.locator('.excalidraw')).toBeVisible();
  await expect(page.locator('.board-participant-count')).toContainText('2');
  await guestPage.getByRole('button', { name: 'Русский язык' }).click();
  await guestPage.getByRole('button', { name: 'Комментарий к ответу', exact: true }).click();
  await expect(guestPage.locator('.save-state')).toContainText('Сохранено');
  await expect
    .poll(async () => {
      const p = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
      return p.scene.filter((e: any) => e.type === 'text' && !e.isDeleted).length;
    })
    .toBe(2);
  const downloadScene = async () => {
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
    const awaited = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Редактируемая сцена .excalidraw' }).click();
    const d = await awaited;
    return JSON.parse(await readFile((await d.path())!, 'utf8'));
  };
  await expect
    .poll(async () => {
      const data = await downloadScene();
      return data.elements.some((e: any) => e.text?.includes('Комментарий преподавателя'));
    })
    .toBeTruthy();
  await guest.setOffline(true);
  await guestPage.getByRole('button', { name: 'Подлежащее', exact: true }).click();
  await expect(guestPage.locator('.save-state')).toContainText('Нет связи');
  await guest.setOffline(false);
  await expect(guestPage.locator('.save-state')).toContainText('Сохранено');
  await guestPage.reload();
  await expect(guestPage.locator('.excalidraw')).toBeVisible();
  await expect(guestPage.locator('.save-state')).toContainText('Сохранено');
  const afterOffline = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
  expect(afterOffline.scene.some((e: any) => e.type === 'line' && !e.isDeleted)).toBeTruthy();
  await page.getByRole('button', { name: 'Шаг назад', exact: true }).click();
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await expect
    .poll(async () => {
      const snapshot = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
      return snapshot.scene.filter((e: any) => e.type === 'text' && !e.isDeleted).length;
    })
    .toBe(1);
  const afterUndo = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
  expect(
    afterUndo.scene.some((e: any) => e.text?.includes('Комментарий преподавателя') && !e.isDeleted),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Шаг вперед', exact: true }).click();
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await page.screenshot({ path: testInfo.outputPath('desktop-board.png') });
  // PDF pages are locked image backgrounds with independent persistent annotations.
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 2; i++) {
    const p = pdf.addPage([595, 842]);
    p.drawText(`Worksheet ${i + 1}`, { x: 60, y: 750, size: 24 });
  }
  await page.locator('input[type=file][hidden]').setInputFiles({
    name: 'Лист разбора.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('.import-progress')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('.page-thumb')).toHaveCount(3);
  await page.getByRole('button', { name: 'Сказуемое', exact: true }).click();
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  const updated = await (await request.get(`/api/v1/boards/${board.id}`)).json();
  const imported = updated.pages.find((p: any) => p.title.includes('Лист разбора'));
  const importedScene = await (await request.get(`/api/v1/pages/${imported.id}/snapshot`)).json();
  expect(importedScene.scene.some((e: any) => e.type === 'image' && e.locked)).toBeTruthy();
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Документ PDF', exact: true }).click();
  const exported = await pdfDownload;
  const exportedBytes = await readFile((await exported.path())!);
  expect(exportedBytes.subarray(0, 5).toString()).toBe('%PDF-');
  // A student account uses a separate browser session.
  const studentContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    studentPage = await studentContext.newPage();
  studentPage.on('pageerror', (e) => errors.push(e.message));
  await studentPage.goto(accountInvite.url);
  await studentPage.getByLabel('Ваше имя', { exact: true }).fill('Демо-ученик А');
  await studentPage.getByLabel('Электронная почта').fill('student@example.test');
  await studentPage.getByLabel('Пароль — от 10 символов').fill('student-test-password');
  await studentPage.getByRole('button', { name: 'Создать вход в кабинет' }).click();
  await expect(studentPage.getByRole('dialog')).toBeVisible();
  await studentPage.getByRole('button', { name: 'Пропустить обучение' }).click();
  await studentPage.goto(`/homework/${hw.id}`);
  await studentPage
    .getByLabel('Ответ и комментарий')
    .fill('Грамматические основы: солнце скрылось, ветер стих.');
  await studentPage.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await studentPage.reload();
  await expect(studentPage.getByLabel('Ответ и комментарий')).toHaveValue(/Грамматические/);
  await studentPage.getByRole('button', { name: 'Отправить работу', exact: true }).click();
  await expect(studentPage.locator('.badge').filter({ hasText: 'На проверке' })).toBeVisible();
  await page.goto(`/homework/${hw.id}`);
  await page.getByLabel('Баллы · максимум 10').fill('8');
  await page
    .getByLabel('Комментарий преподавателя')
    .fill('Хорошо. Повторите смысловые отношения между частями.');
  await page.getByRole('button', { name: 'Завершить проверку', exact: true }).click();
  await studentPage.reload();
  await expect(studentPage.getByRole('heading', { name: '8 / 10 баллов' })).toBeVisible();
  await studentPage.screenshot({
    path: testInfo.outputPath('mobile-homework.png'),
    fullPage: true,
  });
  await page.goto('/finances');
  await expect(page.getByText(/К оплате.*500/)).toBeVisible();
  // All primary routes work at desktop and mobile widths with no document overflow.
  const routes = [
    '/',
    '/schedule',
    '/students',
    '/boards',
    '/homework',
    '/materials',
    '/progress',
    '/reports',
    '/finances',
    '/documents',
    '/tasks',
    '/notifications',
    '/settings',
    '/help',
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('.content h1').first()).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
        `${route} at ${width}px`,
      ).toBeTruthy();
    }
  }
  await studentPage.goto('/');
  await studentPage.goto('/progress');
  await expect(studentPage.getByText(/Итоги учебного месяца/)).toBeVisible();
  await studentPage.goto('/');
  await studentPage.screenshot({
    path: testInfo.outputPath('mobile-dashboard.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await teacher.close();
  await guest.close();
  await studentContext.close();
});
