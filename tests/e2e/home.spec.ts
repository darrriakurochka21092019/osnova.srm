import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../../apps/api/src/app';
import { loginTeacher } from './helpers';

// These screens need both empty and populated states, independent of board fixtures.
test.use({ baseURL: 'http://127.0.0.1:4174' });
let homeApp: Awaited<ReturnType<typeof createApp>>;
let homeData: string;
test.beforeAll(async () => {
  homeData = await mkdtemp(path.join(tmpdir(), 'eduspace-home-e2e-'));
  homeApp = await createApp({
    dataDir: homeData,
    origin: 'http://127.0.0.1:4174',
    logger: false,
    reminders: false,
  });
  await homeApp.app.listen({ host: '127.0.0.1', port: 4174 });
});
test.beforeEach(async ({ request }) => {
  await loginTeacher(request);
});
test.afterAll(async () => {
  await homeApp?.app.close();
  if (homeData) await rm(homeData, { recursive: true, force: true });
});

async function fits(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBeTruthy();
}

test('redesigned login supports password visibility, recovery guidance, invitation entry and a browser-only session', async ({
  browser,
  request,
}, info) => {
  const context = await browser.newContext({ viewport: { width: 1586, height: 992 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Рады видеть вас', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('login-desktop.png'), fullPage: true });
  for (const width of [1280, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: width < 760 ? 844 : 800 });
    await fits(page);
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
    if (width === 390)
      await page.screenshot({ path: info.outputPath('login-mobile.png'), fullPage: true });
  }
  await page.getByLabel('Пароль', { exact: true }).fill('temporary-password');
  await page.getByRole('button', { name: 'Показать пароль', exact: true }).click();
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Скрыть пароль', exact: true }).click();
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Забыли пароль?', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('новое приглашение в кабинет');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Помощь', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Caps Lock');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Конфиденциальность', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('сервере вашего пространства');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const response = await request.post('/api/v1/students', {
    data: { name: 'Демо вход', subject: 'Физика' },
  });
  expect(response.ok()).toBeTruthy();
  const student = await response.json();
  const room = await (await request.get(`/api/v1/classrooms/${student.classroom_id}`)).json();
  await page.getByRole('button', { name: 'Войти по приглашению', exact: true }).click();
  await page.getByLabel('Ссылка-приглашение').fill('https://example.test/join#not-a-valid-invite');
  await page.getByRole('button', { name: 'Открыть приглашение', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('полную ссылку');
  expect(new URL(page.url()).hostname).toBe('127.0.0.1');
  await page.getByLabel('Ссылка-приглашение').fill(room.link);
  await page.getByRole('button', { name: 'Открыть приглашение', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Готовы начать?', exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByLabel('Электронная почта', { exact: true }).fill('teacher@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('teacher-test-password');
  await page.getByLabel('Запомнить на этом устройстве').uncheck();
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Хорошего дня!', exact: true })).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === 'osnova_session')?.expires).toBe(-1);
  await expect(page.locator('.home-hero')).toContainText('Место, где становится понятно');
  await expect(page.locator('.home-stats strong')).toHaveText(['0', '0', '0']);
  await expect(page.locator('.home-calm')).toBeVisible();
  await page.setViewportSize({ width: 1586, height: 992 });
  await page.screenshot({ path: info.outputPath('home-empty.png'), fullPage: true });
  expect(errors).toEqual([]);
  await context.close();
});

test('teacher home shows real counters, lesson preparation, recent files and working quick actions on desktop and mobile', async ({
  browser,
  request,
}, info) => {
  const post = async (url: string, data: any) => {
    const response = await request.post(`/api/v1${url}`, { data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const students = [];
  const entries = [];
  for (const [name, grade, subject, start, title, color] of [
    ['Демо Саша', '9 класс', 'Русский язык', '17:00', 'Причастный оборот', 'purple'],
    ['Демо Миша', '7 класс', 'Математика', '18:30', 'Линейные уравнения', 'mint'],
    ['Демо Таня', '8 класс', 'Английский язык', '20:00', 'Времена глагола', 'peach'],
  ]) {
    const student = await post('/students', { name, grade, subject, color });
    students.push(student);
    entries.push(
      await post('/records/lesson', {
        studentId: student.id,
        data: {
          title,
          start: `${day}T${start}:00+03:00`,
          duration: 60,
          price: 1500,
          subject,
          status: 'planned',
        },
      }),
    );
  }
  for (let i = 0; i < 4; i++)
    await post('/records/homework', {
      studentId: students[0].id,
      data: {
        title: `Демо работа ${i + 1}`,
        description: 'Прочитайте условие',
        due: `${day}T22:00:00+03:00`,
        status: 'submitted',
      },
    });
  await post('/records/task', {
    data: { title: 'Подготовить отчёт за октябрь', due: `${day}T23:00:00+03:00`, done: false },
  });
  await post('/records/task', { data: { title: 'Отметить оплату', done: false } });
  await post('/records/task', { data: { title: 'Демо выполненное дело', done: true } });
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Demo worksheet');
  const uploaded = await request.post('/api/v1/files', {
    multipart: {
      file: {
        name: 'Демо конспект.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(await pdf.save()),
      },
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  const file = await uploaded.json();
  for (const title of [
    'Причастный оборот — конспект',
    'Линейные уравнения — практика',
    'Памятка. Времена глагола',
  ])
    await post('/records/material', {
      data: { title, description: 'Материалы для повторения', folder: 'Демо', fileIds: [file.id] },
    });
  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1586, height: 992 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(`${day}T12:00:00Z`);
  await page.goto('/');
  await expect(page.locator('.home-stats strong')).toHaveText(['3', '4', '2']);
  await expect(page.locator('.home-lesson')).toHaveCount(3);
  await expect(page.locator('.home-attention-row')).toHaveCount(3);
  await expect(page.locator('.home-material')).toHaveCount(3);
  await expect(page.locator('.home-hero')).toContainText('Русский язык, 9 класс');
  await expect(page.locator('.home-hero')).toContainText('17:00–18:00 МСК');
  await expect(page.locator('.home-hero')).toContainText('через 2 ч');
  await page.evaluate(() => document.fonts.ready);
  await fits(page);
  await page.screenshot({ path: info.outputPath('home-desktop.png'), fullPage: true });
  for (const width of [1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 760 ? 844 : 800 });
    await fits(page);
    if (width < 760)
      await expect
        .poll(async () => {
          const b = await page.locator('.sidebar').boundingBox();
          return b ? b.x + b.width : 0;
        })
        .toBeLessThanOrEqual(1);
    if (width === 390)
      await page.screenshot({ path: info.outputPath('home-mobile.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 1586, height: 992 });
  await page.getByRole('button', { name: 'Открыть подготовку', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/lesson/${students[0].classroom_id}/prepare\\?lesson=${entries[0].id}`),
  );
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать урок', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Причастный оборот', exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: /Подготовить урок.*Открыть общую/ }).click();
  await page.getByRole('combobox', { name: 'Ученик', exact: true }).selectOption(students[1].id);
  await page.getByRole('button', { name: 'Открыть доску ученика', exact: true }).click();
  await expect(page).toHaveURL(`/lesson/${students[1].classroom_id}/prepare`);
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await page.goto('/');
  await page.getByRole('button', { name: /Назначить задание.*Выбрать ученика/ }).click();
  await page.getByLabel('Название', { exact: true }).fill('Демо задание с главной');
  await page.getByRole('combobox', { name: 'Ученик', exact: true }).selectOption(students[0].id);
  await page.getByLabel('Инструкция', { exact: true }).fill('Выполните упражнение');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    (await (await request.get('/api/v1/records/homework')).json()).some(
      (r: any) => r.data.title === 'Демо задание с главной',
    ),
  ).toBeTruthy();
  await page.getByRole('button', { name: /Загрузить материал.*Добавить файл/ }).click();
  await page.getByLabel('Название', { exact: true }).fill('Демо новый материал с главной');
  await page
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'Демо новый.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await expect(page.getByRole('dialog').locator('.file-chip')).toHaveCount(1);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.home-material').first()).toContainText(
    'Демо новый материал с главной',
  );
  await page.locator('.home-material-open').first().click();
  const href = await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Файл 1', exact: true })
    .getAttribute('href');
  const downloaded = await request.get(href!);
  expect(downloaded.ok()).toBeTruthy();
  expect(downloaded.headers()['content-type']).toContain('application/pdf');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await post('/records/lesson', {
    studentId: students[0].id,
    data: {
      title: 'Демо отменённый урок',
      start: `${day}T21:00:00+03:00`,
      duration: 60,
      price: 1500,
      status: 'cancelled',
    },
  });
  await page.reload();
  await expect(page.locator('.home-stats strong')).toHaveText(['3', '4', '2']);
  await expect(page.locator('.home-lesson.cancelled')).toHaveCount(1);
  expect(errors).toEqual([]);
  await context.close();
});
