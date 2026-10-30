import { test, expect } from './fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../../apps/api/src/app';
import { loginTeacher } from './helpers';

test.use({ baseURL: 'http://127.0.0.1:4175' });
let ctx: Awaited<ReturnType<typeof createApp>>, dataDir: string;
test.beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'eduspace-cabinet-'));
  ctx = await createApp({
    dataDir,
    origin: 'http://127.0.0.1:4175',
    logger: false,
    reminders: false,
  });
  await ctx.app.listen({ host: '127.0.0.1', port: 4175 });
});
test.beforeEach(async ({ request }) => {
  await loginTeacher(request);
});
test.afterEach(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});
test.afterAll(async () => {
  await ctx?.app.close();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

async function post(request: APIRequestContext, url: string, data: any) {
  const r = await request.post(`/api/v1${url}`, { data });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function fits(page: Page) {
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))) {
    const overflow = await page.locator('body *').evaluateAll((elements) =>
      elements
        .map((el) => ({
          tag: el.tagName,
          cls: el.className,
          right: el.getBoundingClientRect().right,
          width: el.getBoundingClientRect().width,
        }))
        .filter((b) => b.right > innerWidth + 1 && b.width > 0)
        .slice(0, 12),
    );
    console.log('Overflow', page.url(), await page.viewportSize(), overflow);
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBeTruthy();
}
async function seed(request: APIRequestContext) {
  const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10),
    month = day.slice(0, 7);
  const student = await post(request, '/students', {
    name: 'Демо Саша',
    grade: '9 класс',
    subject: 'Русский язык',
    goal: 'Уверенно применять правила пунктуации',
    program:
      'База: части речи\nИмя существительное\nГлагол\n\nСинтаксис\nГрамматическая основа\nПричастный оборот',
    color: 'purple',
  });
  const second = await post(request, '/students', {
    name: 'Демо Миша',
    grade: '7 класс',
    subject: 'Математика',
    color: 'mint',
  });
  const lesson = await post(request, '/records/lesson', {
    studentId: student.id,
    data: {
      title: 'Причастный оборот',
      start: `${day}T17:00:00+03:00`,
      duration: 60,
      price: 1200,
      status: 'planned',
      subject: 'Русский язык',
    },
  });
  await post(request, '/records/lesson', {
    studentId: student.id,
    data: {
      title: 'Грамматическая основа',
      start: `${day}T10:00:00+03:00`,
      duration: 60,
      price: 1200,
      status: 'completed',
    },
  });
  await post(request, '/records/lesson', {
    studentId: second.id,
    data: {
      title: 'Занятие мини-группы',
      start: `${day}T19:00:00+03:00`,
      duration: 90,
      price: 800,
      status: 'planned',
      studentIds: [student.id],
    },
  });
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('EduSpace - worksheet 1');
  pdf.addPage().drawText('EduSpace - worksheet 2');
  const bytes = Buffer.from(await pdf.save());
  const file = await request.post('/api/v1/files', {
    multipart: { file: { name: 'Демо практика.pdf', mimeType: 'application/pdf', buffer: bytes } },
  });
  expect(file.ok()).toBeTruthy();
  const asset = await file.json();
  await post(request, '/records/material', {
    data: {
      title: 'Причастный оборот — практика',
      folder: 'Синтаксис',
      fileIds: [asset.id],
      description: 'Упражнения на пунктуацию',
    },
  });
  await post(request, '/records/material', {
    data: { title: 'Формулы и уравнения', folder: 'Математика', fileIds: [asset.id] },
  });
  await post(request, '/records/document', {
    studentId: student.id,
    data: { title: 'Демо договор', type: 'contract', status: 'signed', fileIds: [asset.id] },
  });
  await post(request, '/records/task', {
    studentId: student.id,
    data: { title: 'Проверить письменную работу', due: `${day}T23:00:00+03:00`, done: false },
  });
  await post(request, '/records/note', {
    studentId: student.id,
    data: { title: 'Наблюдение после урока', text: 'Начать с короткого повторения.' },
  });
  for (const [topic, skill, score] of [
    ['Грамматическая основа', 'mastered', 8],
    ['Причастный оборот', 'repeat', 5],
  ] as const)
    await post(request, '/records/result', {
      studentId: student.id,
      data: {
        title: `Работа: ${topic}`,
        topic,
        skill,
        score,
        maxScore: 8,
        date: `${day}T12:00:00+03:00`,
        recommendation:
          skill === 'repeat' ? 'Повторить определяемое слово' : 'Уверенно находит основу',
      },
    });
  await post(request, '/records/transaction', {
    studentId: student.id,
    data: {
      title: 'Оплата двух занятий',
      type: 'payment',
      amount: 2400,
      date: `${day}T12:00:00+03:00`,
    },
  });
  await post(request, '/records/transaction', {
    data: {
      title: 'Учебные материалы',
      type: 'expense',
      amount: 800,
      date: `${day}T12:00:00+03:00`,
    },
  });
  return { student, second, lesson, asset, bytes, day, month };
}

test('all cabinet surfaces share the brand and pattern; calendar, student program, private files, reports, tasks and settings work', async ({
  browser,
  request,
}, info) => {
  test.setTimeout(160000);
  const { student, lesson, month } = await seed(request);
  const context = await browser.newContext({
      storageState: await request.storageState(),
      viewport: { width: 1586, height: 992 },
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const routes = [
    ['schedule', '/schedule'],
    ['students', '/students'],
    ['student', `/students/${student.id}`],
    ['program', `/students/${student.id}?tab=program`],
    ['homework', '/homework'],
    ['assignment', '/homework/new'],
    ['materials', '/materials'],
    ['progress', '/progress'],
    ['reports', '/reports'],
    ['finances', '/finances'],
    ['documents', '/documents'],
    ['tasks', '/tasks'],
    ['notifications', '/notifications'],
    ['settings', '/settings'],
    ['help', '/help'],
  ];
  for (const [name, url] of routes) {
    await page.setViewportSize({ width: 1586, height: 992 });
    await page.goto(url);
    await expect(page.locator('.content h1').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (name === 'documents')
      await expect(page.locator('.cabinet-pdf-sheet')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.teacher-shell')).toBeVisible();
    expect(
      await page.locator('.main-column').evaluate((e) => getComputedStyle(e).backgroundImage),
    ).toContain('page-pattern');
    await fits(page);
    await page.screenshot({ path: info.outputPath(`${name}-desktop.png`), fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await fits(page);
    }
    await page.screenshot({ path: info.outputPath(`${name}-mobile.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1586, height: 992 });
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Месяц', exact: true }).click();
  await expect(page.locator('.month-grid')).toBeVisible();
  await page.getByRole('button', { name: 'День', exact: true }).click();
  await expect(page.locator('.day-column')).toHaveCount(1);
  await page.goto('/students');
  await page.getByRole('textbox', { name: 'Поиск ученика', exact: true }).fill('Демо Саша');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: /Карточка/ }).click();
  await expect(page.locator('.student-classroom-card')).toContainText('Причастный оборот');
  await page.getByRole('button', { name: 'Программа', exact: true }).click();
  await expect(page.locator('.cabinet-program')).toHaveCount(2);
  await page.getByRole('button', { name: 'Редактировать программу', exact: true }).first().click();
  await page
    .getByRole('textbox', { name: 'Индивидуальная программа', exact: true })
    .fill('Синтаксис\nПричастный оборот\nСложное предложение');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.cabinet-program')).toHaveCount(1);
  await page.goto('/materials');
  await page.getByRole('button', { name: 'Синтаксис', exact: true }).click();
  await expect(page.locator('.cabinet-material-card')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Открыть материал: Причастный оборот — практика', exact: true })
    .click();
  await expect(page.locator('.cabinet-pdf canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Следующая страница PDF' })).toBeEnabled();
  await page.getByRole('button', { name: 'Следующая страница PDF' }).click();
  await expect(page.locator('.cabinet-pdf-controls')).toContainText('2 из 2');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.goto('/documents');
  await expect(page.locator('.cabinet-pdf canvas')).toBeVisible();
  await page
    .getByRole('button', { name: 'Действия с документом: Демо договор', exact: true })
    .click();
  await expect(page.locator('.cabinet-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cabinet-popover')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Действия с документом: Демо договор', exact: true })
    .click();
  await page.getByRole('button', { name: 'Изменить документ', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Название', exact: true })
    .fill('Демо договор — обновлён');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('tbody')).toContainText('Демо договор — обновлён');
  await page.getByRole('button', { name: 'Архив', exact: true }).click();
  await expect(page.getByText('Документов пока нет', { exact: true })).toBeVisible();
  await page.goto('/reports');
  await page.getByRole('button', { name: 'Собрать по проведённым урокам', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Что изучили', exact: true })).toHaveValue(
    /Грамматическая основа/,
  );
  await page
    .getByRole('textbox', { name: 'Что получается', exact: true })
    .fill('Уверенно находит основу');
  await page
    .getByRole('textbox', { name: 'Над чем работаем', exact: true })
    .fill('Объяснение пунктуации');
  await page
    .getByRole('textbox', { name: 'План на следующий месяц', exact: true })
    .fill('Закрепить новый материал');
  await page.getByLabel('Показать в кабинете ученика').check();
  await page.getByRole('button', { name: 'Создать отчёт', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить отчёт', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Что получается', exact: true })).toHaveValue(
    'Уверенно находит основу',
  );
  const savedReports = await (await request.get('/api/v1/records/report')).json();
  const savedReport = savedReports.find(
    (r: any) => r.student_id === student.id && r.data.month === month,
  );
  const older = await post(request, '/records/report', {
    studentId: student.id,
    data: {
      title: 'Ещё один отчёт за месяц',
      month,
      summary: 'Сохранённый прежний отчёт',
      plan: 'Прежний план',
    },
  });
  await page.reload();
  await page.getByRole('combobox', { name: 'Отчёты за месяц', exact: true }).selectOption(older.id);
  await expect(page.getByRole('textbox', { name: 'Что изучили', exact: true })).toHaveValue(
    'Сохранённый прежний отчёт',
  );
  await page
    .getByRole('combobox', { name: 'Отчёты за месяц', exact: true })
    .selectOption(savedReport.id);
  await expect(page.getByRole('textbox', { name: 'Что получается', exact: true })).toHaveValue(
    'Уверенно находит основу',
  );
  await page.getByRole('button', { name: 'Предпросмотр / PDF', exact: true }).click();
  await expect(page.locator('.print-sheet')).toContainText('Объяснение пунктуации');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.goto('/finances');
  await expect(page.locator('.cabinet-stats-four')).toContainText('2 400');
  await page.getByRole('button', { name: 'История', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Оплата двух занятий');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Завершить задачу', exact: true }).first().click();
  await page.getByRole('button', { name: 'Выполненные', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Вернуть задачу', exact: true }).first(),
  ).toBeVisible();
  await page.goto('/settings');
  await page.getByLabel('Уведомления: Домашние задания', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Уведомления: Домашние задания', { exact: true })).not.toBeChecked();
  expect((await (await request.get('/api/v1/me')).json()).settings.notifications.homework).toBe(
    false,
  );
  await page.goto(`/lesson/${student.classroom_id}?lesson=${lesson.id}`);
  await expect(page.getByRole('heading', { name: 'Причастный оборот', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('entry-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await fits(page);
  await page.screenshot({ path: info.outputPath('entry-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
  await context.close();
});

test('homework composer, PDF review, return for revision and student resubmission persist without exposing teacher notes', async ({
  browser,
  request,
}, info) => {
  const { student, asset, bytes, day } = await seed(request);
  const invite = await post(request, `/students/${student.id}/invite`, {});
  const pupil = await browser.newContext();
  const pupilPage = await pupil.newPage();
  const redeemed = await pupil.request.post('http://127.0.0.1:4175/api/v1/invites/redeem', {
    data: {
      token: new URL(invite.url).hash.slice(1),
      name: 'Демо ученик',
      email: `student-${student.id}@example.test`,
      password: 'student-test-password',
    },
  });
  expect(redeemed.ok()).toBeTruthy();
  await pupil.request.patch('http://127.0.0.1:4175/api/v1/me', {
    data: { settings: { onboardingComplete: true } },
  });
  const teacher = await browser.newContext({
      storageState: await request.storageState(),
      viewport: { width: 1586, height: 992 },
    }),
    page = await teacher.newPage();
  await page.goto(`/homework/new?student=${student.id}`);
  await page.getByLabel('Название', { exact: true }).fill('Практика с предпросмотром');
  await page
    .getByLabel('Что нужно сделать', { exact: true })
    .fill('1. Расставьте запятые.\n2. Объясните правило.');
  await page.getByLabel('Сдать до · МСК', { exact: true }).fill(`${day}T23:00`);
  await page.getByRole('button', { name: 'Из материалов', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Причастный оборот — практика/ })
    .first()
    .click();
  await expect(page.locator('.cabinet-student-preview')).toContainText('Объясните правило');
  await page.getByRole('button', { name: 'Назначить задание', exact: true }).click();
  await expect(page).toHaveURL(/\/homework\/[a-f0-9-]+$/);
  const id = page.url().split('/').at(-1)!;
  const uploaded = await pupil.request.post('http://127.0.0.1:4175/api/v1/files', {
    multipart: { file: { name: 'Ответ ученика.pdf', mimeType: 'application/pdf', buffer: bytes } },
  });
  expect(uploaded.ok()).toBeTruthy();
  const answerAsset = await uploaded.json();
  await pupilPage.goto(`http://127.0.0.1:4175/homework/${id}`);
  await pupilPage.getByLabel('Ответ и комментарий').fill('Мой первый ответ');
  await pupilPage.getByRole('button', { name: 'Отправить работу', exact: true }).click();
  await pupil.request.patch(`http://127.0.0.1:4175/api/v1/records/homework/${id}`, {
    data: { data: { answerFileIds: [answerAsset.id], status: 'submitted' } },
  });
  await page.reload();
  await expect(page.locator('.cabinet-pdf canvas')).toBeVisible();
  await page
    .getByLabel('Комментарий преподавателя', { exact: true })
    .fill('Проверьте положение оборота.');
  await page.getByRole('button', { name: 'Вернуть на доработку', exact: true }).click();
  await pupilPage.reload();
  await expect(pupilPage.getByText('Что исправить', { exact: true })).toBeVisible();
  await expect(pupilPage.locator('.feedback-box')).toContainText('Проверьте положение оборота');
  await pupilPage.getByLabel('Ответ и комментарий').fill('Исправленный ответ');
  await pupilPage.getByRole('button', { name: 'Отправить работу', exact: true }).click();
  await page.reload();
  await page.getByLabel('Баллы · максимум 10', { exact: true }).fill('8');
  await page.getByLabel('Комментарий преподавателя', { exact: true }).fill('Работа принята');
  await page.screenshot({ path: info.outputPath('review-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Завершить проверку', exact: true }).click();
  await pupilPage.reload();
  await expect(
    pupilPage.getByRole('heading', { name: '8 / 10 баллов', exact: true }),
  ).toBeVisible();
  expect(
    (await pupil.request.get(`http://127.0.0.1:4175/api/v1/files/${answerAsset.id}/meta`)).ok(),
  ).toBeTruthy();
  expect((await pupil.request.get('http://127.0.0.1:4175/api/v1/records/note')).status()).toBe(200);
  expect(
    await (await pupil.request.get('http://127.0.0.1:4175/api/v1/records/note')).json(),
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await fits(page);
  await page.screenshot({ path: info.outputPath('review-mobile.png'), fullPage: true });
  await teacher.close();
  await pupil.close();
});
