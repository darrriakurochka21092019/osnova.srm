import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { loginTeacher } from './helpers';

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
  await loginTeacher(request);
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
  await expect(page.getByRole('button', { name: 'Русский язык', exact: true })).toHaveCount(0);
  await expect(page.locator('.pages-sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
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
  await guestPage.getByRole('button', { name: 'Заметка', exact: true }).click();
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
      return data.elements.some((e: any) => e.text?.includes('Идея, вопрос'));
    })
    .toBeTruthy();
  await guest.setOffline(true);
  await guestPage.getByRole('button', { name: 'Текст', exact: true }).click();
  await expect(guestPage.locator('.save-state')).toContainText('Нет связи');
  await guest.setOffline(false);
  await expect(guestPage.locator('.save-state')).toContainText('Сохранено');
  await guestPage.reload();
  await expect(guestPage.locator('.excalidraw')).toBeVisible();
  await expect(guestPage.locator('.save-state')).toContainText('Сохранено');
  const afterOffline = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
  expect(afterOffline.scene.filter((e: any) => e.type === 'text' && !e.isDeleted)).toHaveLength(3);
  await page.getByRole('button', { name: 'Шаг назад', exact: true }).click();
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await expect
    .poll(async () => {
      const snapshot = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
      return snapshot.scene.filter((e: any) => e.type === 'text' && !e.isDeleted).length;
    })
    .toBe(2);
  const afterUndo = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
  expect(
    afterUndo.scene.some((e: any) => e.text?.includes('Идея, вопрос') && !e.isDeleted),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Шаг вперед', exact: true }).click();
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await page.screenshot({ path: testInfo.outputPath('desktop-board.png') });
  // Background changes persist and reach other participants on the same canvas.
  for (const [label, background] of [
    ['Клетка', 'grid'],
    ['Линии', 'ruled'],
    ['Точки', 'dots'],
    ['Белый холст', 'white'],
  ]) {
    await page.getByRole('button', { name: 'Фон', exact: true }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.canvas-paper')).toHaveAttribute('data-background', background);
    await expect(guestPage.locator('.canvas-paper')).toHaveAttribute('data-background', background);
  }
  await page.getByRole('button', { name: 'Фон', exact: true }).click();
  await page.getByRole('button', { name: 'Клетка', exact: true }).click();
  // A PDF remains one movable object with slide navigation and per-slide annotations.
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 2; i++) {
    const p = pdf.addPage([960, 540]);
    p.drawText(`Physics ${i + 1}`, { x: 70, y: 440, size: 30 });
  }
  await page.locator('input[type=file][hidden]').setInputFiles({
    name: 'Физика.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('.import-progress')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('.presentation-controls')).toHaveCount(1);
  await expect(page.locator('.slide-counter')).toHaveText('1 / 2');
  await expect(page.locator('.pages-sidebar')).toHaveCount(0);
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  const updated = await (await request.get(`/api/v1/boards/${board.id}`)).json();
  expect(updated.pages).toHaveLength(1);
  let importedScene = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
  const presentation = importedScene.scene.find((e: any) => e.customData?.presentation);
  expect(presentation.customData.presentation.slides).toHaveLength(2);
  expect(presentation.locked).toBe(false);
  // Keep a substantial set of notes on another slide while handwriting on this one.
  await post(`/pages/${pageId}/operations`, {
    operationId: crypto.randomUUID(),
    changes: Array.from({ length: 600 }, (_, i) => ({
      baseVersion: null,
      element: {
        id: `prior-ink-${i}`,
        index: `b${i.toString(36).padStart(2, '0')}`,
        type: 'freedraw',
        version: 1,
        versionNonce: i + 1,
        x: presentation.x + 20 + (i % 30) * 12,
        y: presentation.y + 20 + Math.floor(i / 30) * 12,
        width: 10,
        height: 5,
        angle: 0,
        strokeColor: '#252846',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fillStyle: 'solid',
        backgroundColor: 'transparent',
        roughness: 0,
        opacity: 100,
        seed: i + 1,
        groupIds: [],
        frameId: null,
        boundElements: null,
        roundness: null,
        link: null,
        locked: false,
        updated: Date.now(),
        points: Array.from({ length: 16 }, (_, p) => [(p * 10) / 15, Math.sin(p) * 5]),
        pressures: [],
        simulatePressure: true,
        isDeleted: false,
        customData: { slideAnnotation: { presentationId: presentation.id, slideIndex: 1 } },
      },
    })),
  });
  await page.reload();
  await expect(page.locator('.slide-counter')).toHaveText('1 / 2');
  await expect.poll(async () => (await downloadScene()).elements.length).toBeGreaterThan(600);
  await page.evaluate(() => {
    const metrics = ((window as any).__inkMetrics = {
      duringPen: 0,
      pages: 0,
      files: 0,
      inlineFileBytes: 0,
      down: false,
    });
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'pen') metrics.down = true;
      },
      true,
    );
    window.addEventListener(
      'pointerup',
      (e) => {
        if (e.pointerType === 'pen') metrics.down = false;
      },
      true,
    );
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'pages') {
        metrics.pages++;
        if (metrics.down) metrics.duringPen++;
        metrics.inlineFileBytes += Object.values(value.files || {}).reduce(
          (n: number, f: any) => n + (f.dataURL?.length || 0),
          0,
        );
      }
      if (this.name === 'files') metrics.files++;
      return original.call(this, value, key!);
    };
  });
  const box = await page.locator('.presentation-controls').boundingBox();
  expect(box).toBeTruthy();
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  const pen = await teacher.newCDPSession(page);
  const penEvent = (
    type: 'mousePressed' | 'mouseMoved' | 'mouseReleased',
    x: number,
    y: number,
    pressure = 0.4,
  ) =>
    pen.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      pointerType: 'pen',
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      force: type === 'mouseReleased' ? 0 : pressure,
    });
  const inkX = box!.x + box!.width * 0.4,
    inkY = box!.y - 100;
  await penEvent('mousePressed', inkX, inkY);
  for (let i = 1; i <= 4; i++)
    await penEvent('mouseMoved', inkX + i * 7.5, inkY + i, 0.3 + i * 0.1);
  // Pausing past the autosave debounce must not end an unfinished native stroke.
  await page.waitForTimeout(650);
  for (let i = 1; i <= 8; i++)
    await penEvent('mouseMoved', inkX + 30 + i * 8.75, inkY + 4 + i, 0.7);
  await penEvent('mouseReleased', inkX + 100, inkY + 12);
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await expect
    .poll(async () => {
      const scene = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
      return scene.scene.filter(
        (e: any) =>
          e.customData?.slideAnnotation?.presentationId === presentation.id && !e.isDeleted,
      ).length;
    })
    .toBeGreaterThan(0);
  const beforeMove = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
  const inkBefore = beforeMove.scene.find(
    (e: any) =>
      e.type === 'freedraw' &&
      e.customData?.slideAnnotation?.presentationId === presentation.id &&
      e.customData.slideAnnotation.slideIndex === 0 &&
      !e.isDeleted,
  );
  expect(inkBefore.width).toBeGreaterThan(80);
  expect(inkBefore.simulatePressure).toBe(false);
  expect(inkBefore.pressures.some((p: number) => p > 0)).toBeTruthy();
  const metrics = await page.evaluate(() => (window as any).__inkMetrics);
  await testInfo.attach('stylus-storage.json', {
    body: JSON.stringify(metrics),
    contentType: 'application/json',
  });
  expect(metrics.duringPen, 'Storage must not run in the active stylus input path').toBe(0);
  expect(
    metrics.inlineFileBytes,
    'Image binaries must not be rewritten inside scene checkpoints',
  ).toBe(0);
  for (let i = 0; i < 12; i++) {
    const x = inkX - 100 + i * 12,
      y = inkY - 65;
    await penEvent('mousePressed', x, y);
    await penEvent('mouseMoved', x + 4, y + 14, 0.8);
    await penEvent('mouseReleased', x + 8, y + 2);
  }
  await expect
    .poll(async () => {
      const snapshot = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
      return snapshot.scene.filter(
        (e: any) =>
          e.type === 'freedraw' && e.customData?.slideAnnotation?.slideIndex === 0 && !e.isDeleted,
      ).length;
    })
    .toBe(13);
  const afterRapid = await page.evaluate(() => (window as any).__inkMetrics);
  expect(afterRapid.duringPen).toBe(0);
  expect(afterRapid.files).toBe(metrics.files);
  expect(afterRapid.inlineFileBytes).toBe(0);
  // Recover pressure-sensitive ink and cached slide binaries after a failed save and reload.
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await page.route('**/api/v1/pages/*/operations', (route) => route.abort('internetdisconnected'));
  await penEvent('mousePressed', inkX - 40, inkY - 35);
  await penEvent('mouseMoved', inkX - 30, inkY - 20, 0.8);
  await penEvent('mouseReleased', inkX - 20, inkY - 35);
  await expect(page.locator('.save-state')).toContainText('Нет связи');
  await page.reload();
  await expect(page.locator('.slide-counter')).toHaveText('1 / 2');
  const recovered = await downloadScene();
  expect(
    recovered.elements.filter(
      (e: any) =>
        e.type === 'freedraw' && e.customData?.slideAnnotation?.slideIndex === 0 && !e.isDeleted,
    ),
  ).toHaveLength(14);
  expect(Object.keys(recovered.files).length).toBeGreaterThanOrEqual(2);
  await page.unroute('**/api/v1/pages/*/operations');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await expect
    .poll(async () => {
      const snapshot = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
      return snapshot.scene.filter(
        (e: any) =>
          e.type === 'freedraw' && e.customData?.slideAnnotation?.slideIndex === 0 && !e.isDeleted,
      ).length;
    })
    .toBe(14);
  await pen.detach();
  const deckBefore = beforeMove.scene.find((e: any) => e.id === presentation.id);
  // Use the native selection tool to move the PDF, then check that its ink follows once.
  await page.keyboard.press('v');
  const dragBox = await page.locator('.presentation-controls').boundingBox();
  await page.mouse.move(dragBox!.x + dragBox!.width / 2, dragBox!.y - 180);
  await page.mouse.down();
  await page.mouse.move(dragBox!.x + dragBox!.width / 2 + 80, dragBox!.y - 150, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const scene = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
      return Math.abs(scene.scene.find((e: any) => e.id === presentation.id).x - deckBefore.x);
    })
    .toBeGreaterThan(10);
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  const afterMove = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
  const deckAfter = afterMove.scene.find((e: any) => e.id === presentation.id);
  const inkAfter = afterMove.scene.find((e: any) => e.id === inkBefore.id);
  expect(inkAfter.x - inkBefore.x).toBeCloseTo(deckAfter.x - deckBefore.x, 1);
  expect(inkAfter.y - inkBefore.y).toBeCloseTo(deckAfter.y - deckBefore.y, 1);
  await page.getByRole('button', { name: 'Следующий слайд: Физика', exact: true }).click();
  await expect(page.locator('.slide-counter')).toHaveText('2 / 2');
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await guestPage.reload();
  await expect(guestPage.locator('.slide-counter')).toHaveText('2 / 2');
  await page.getByRole('button', { name: 'Предыдущий слайд: Физика', exact: true }).click();
  await expect(page.locator('.slide-counter')).toHaveText('1 / 2');
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await page.reload();
  await expect(page.locator('.slide-counter')).toHaveText('1 / 2');
  await expect(page.locator('.canvas-paper')).toHaveAttribute('data-background', 'grid');
  importedScene = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
  expect(
    importedScene.scene.some(
      (e: any) => e.customData?.slideAnnotation?.slideIndex === 0 && !e.isDeleted,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('unified-canvas.png') });
  await expect(
    page.locator('.board-warning').filter({ hasText: 'Другой участник изменил' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Документ PDF', exact: true }).click();
  const exported = await pdfDownload;
  const exportedBytes = await readFile((await exported.path())!);
  expect(exportedBytes.subarray(0, 5).toString()).toBe('%PDF-');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.slide-counter')).toHaveText('1 / 2');
  await page.getByRole('button', { name: 'Следующий слайд: Физика', exact: true }).click();
  await expect(page.locator('.slide-counter')).toHaveText('2 / 2');
  await page.getByRole('button', { name: 'Фон', exact: true }).click();
  const picker = await page.locator('.background-picker').boundingBox();
  expect(picker!.x).toBeGreaterThanOrEqual(0);
  expect(picker!.x + picker!.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Клетка', exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
  ).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('mobile-board.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.locator(`a[href="/students/${a.id}"]`) })
      .getByText(/^К оплате\s+500\s+₽$/),
  ).toBeVisible();
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
    // Each route mounts the whole workspace store. Give the second pass its own session
    // so a minute of deliberately dense API traffic does not exhaust the real rate limit.
    if (width === 390) {
      const login = await teacher.request.post('http://127.0.0.1:4173/api/v1/auth/login', {
        data: { email: 'teacher@example.test', password: 'teacher-test-password' },
      });
      expect(login.ok()).toBeTruthy();
    }
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
  // An unsent version-1 draft from the previous release survives the IndexedDB upgrade.
  const legacy = await browser.newContext({ storageState: await request.storageState() });
  const legacyLogin = await legacy.request.post('http://127.0.0.1:4173/api/v1/auth/login', {
    data: { email: 'teacher@example.test', password: 'teacher-test-password' },
  });
  expect(legacyLogin.ok()).toBeTruthy();
  const legacyPage = await legacy.newPage();
  legacyPage.on('pageerror', (e) => errors.push(e.message));
  await legacyPage.goto('/api/v1/health');
  const user = await (await legacy.request.get('http://127.0.0.1:4173/api/v1/me')).json();
  const latest = await (
    await legacy.request.get(`http://127.0.0.1:4173/api/v1/pages/${pageId}/snapshot`)
  ).json();
  const assets = await (
    await legacy.request.get(`http://127.0.0.1:4173/api/v1/boards/${board.id}/files`)
  ).json();
  const slideAsset = assets.find(
    (f: any) => f.excalidraw_id === presentation.customData.presentation.slides[0].fileId,
  );
  const oldInk = {
    ...latest.scene.find((e: any) => e.type === 'freedraw' && !e.simulatePressure),
    id: 'legacy-unsent-ink',
    version: 1,
    versionNonce: 12345,
  };
  await legacyPage.evaluate(
    async ({ key, base, ink, asset }) => {
      const blob = await (await fetch(`/api/v1/files/${asset.id}`)).blob();
      const dataURL = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(blob);
      });
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('osnova-pending', 1);
        opening.onupgradeneeded = () => opening.result.createObjectStore('pages');
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction('pages', 'readwrite');
          tx.objectStore('pages').put(
            {
              base,
              elements: [...base, ink],
              files: {
                [asset.excalidraw_id]: {
                  id: asset.excalidraw_id,
                  mimeType: asset.mime,
                  dataURL,
                  created: Date.now(),
                },
              },
            },
            key,
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        opening.onerror = () => reject(opening.error);
      });
    },
    { key: `${user.id}:${pageId}`, base: latest.scene, ink: oldInk, asset: slideAsset },
  );
  await legacyPage.goto(`/board/${board.id}`);
  await expect(legacyPage.locator('.save-state')).toContainText('Сохранено');
  await expect
    .poll(async () => {
      const snapshot = await (await request.get(`/api/v1/pages/${pageId}/snapshot`)).json();
      return snapshot.scene.some((e: any) => e.id === 'legacy-unsent-ink' && !e.isDeleted);
    })
    .toBeTruthy();
  expect(
    await legacyPage.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const opening = indexedDB.open('osnova-pending');
          opening.onsuccess = () => {
            const version = opening.result.version;
            opening.result.close();
            resolve(version);
          };
        }),
    ),
  ).toBe(2);
  await legacy.close();
  expect(errors).toEqual([]);
  await teacher.close();
  await guest.close();
  await studentContext.close();
});
