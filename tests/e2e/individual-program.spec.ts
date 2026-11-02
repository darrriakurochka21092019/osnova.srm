import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { test, expect } from './fixtures';
import { loginTeacher } from './helpers';

test('individual programme uses actual topics, assessments, lesson and material actions, and exports all sections on desktop and mobile', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const post = async (url: string, data: unknown) => {
    const r = await request.post('/api/v1' + url, { data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const pupil = await post('/students', {
    name: 'Саша',
    grade: '9 класс',
    subject: 'Русский язык',
    program: 'ОГЭ по русскому',
    goal: 'Освоить синтаксис и уверенно применять правила',
  });
  const other = await post('/students', { name: 'Другой демо ученик' });
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  const bytes = Buffer.from(await pdf.save());
  const upload = await request.post('/api/v1/files', {
    multipart: { file: { name: 'Практика.pdf', mimeType: 'application/pdf', buffer: bytes } },
  });
  expect(upload.ok(), await upload.text()).toBeTruthy();
  const file = await upload.json();
  const material = await post('/records/material', {
    data: {
      title: 'Причастный оборот — практика',
      shared: true,
      studentIds: [pupil.id],
      fileIds: [file.id],
    },
  });
  const topics = (titles: string[]) =>
    titles.map((title) => ({
      id: randomUUID(),
      title,
      status: 'auto',
      materialIds: title === 'Причастный оборот' ? [material.id] : [],
    }));
  const curriculum = {
    version: 1,
    lessonsPerWeek: 2,
    duration: 60,
    blocks: [
      {
        id: randomUUID(),
        title: 'База: части речи',
        topics: topics(['Имя существительное', 'Глагол', 'Причастие']),
      },
      {
        id: randomUUID(),
        title: 'Синтаксис',
        topics: topics([
          'Грамматическая основа',
          'Словосочетание',
          'Однородные члены',
          'Причастный оборот',
          'Сложное предложение',
        ]),
      },
      { id: randomUUID(), title: 'Орфография', topics: [] },
      { id: randomUUID(), title: 'Работа с текстом', topics: [] },
    ],
  };
  const patch = await request.patch(`/api/v1/students/${pupil.id}`, { data: { curriculum } });
  expect(patch.ok(), await patch.text()).toBeTruthy();
  const now = Date.now(),
    at = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const assessment = async (topic: string, skill: string, studentId = pupil.id, days = -1) =>
    post('/records/result', {
      studentId,
      data: {
        title: `Проверка: ${topic}`,
        topic,
        date: at(days),
        score: skill === 'mastered' ? 8 : 5,
        maxScore: 8,
        skill,
        recommendation:
          skill === 'repeat'
            ? 'Вспомнить, как находить определяемое слово в причастных оборотах.'
            : '',
      },
    });
  for (const title of [
    'Имя существительное',
    'Глагол',
    'Причастие',
    'Грамматическая основа',
    'Словосочетание',
    'Однородные члены',
  ])
    await assessment(title, 'mastered');
  await assessment('Причастный оборот', 'learning');
  await assessment('Определяемое слово', 'repeat');
  await assessment('Сложное предложение', 'mastered', other.id);
  await assessment('Чужая тема для повторения', 'repeat', other.id);
  const lesson = await post('/records/lesson', {
    studentId: pupil.id,
    data: {
      title: 'Закрепить причастный оборот',
      start: at(1),
      duration: 60,
      price: 1500,
      status: 'planned',
      notes: 'Повторим правила и выполним упражнения на разные случаи употребления.',
    },
  });
  for (const [title, days] of [
    ['Проверить понимание', 2],
    ['Сложное предложение', 6],
  ] as const)
    await post('/records/lesson', {
      studentId: pupil.id,
      data: {
        title,
        start: at(days),
        duration: 60,
        price: 1500,
        status: 'planned',
        notes: 'Работаем по индивидуальной программе.',
      },
    });
  await post('/records/lesson', {
    studentId: pupil.id,
    data: {
      title: 'Отменённый урок программы',
      start: at(0.2),
      duration: 60,
      price: 1500,
      status: 'cancelled',
    },
  });
  await post('/records/lesson', {
    studentId: other.id,
    data: {
      title: 'Чужой ближайший урок',
      start: at(0.1),
      duration: 60,
      price: 1500,
      status: 'planned',
    },
  });
  await post('/records/note', {
    studentId: pupil.id,
    data: { title: 'Приватная заметка', text: 'Не должно попасть в экспорт программы' },
  });
  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1586, height: 992 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`/students/${pupil.id}`);
    await page.getByRole('tab', { name: 'Программа', exact: true }).click();
    await expect(page).toHaveURL(`/students/${pupil.id}/program`);
    await expect(
      page.getByRole('heading', { name: 'Индивидуальная программа', exact: true }),
    ).toBeVisible();
    const sections = page.getByRole('region', { name: 'Разделы программы' });
    await expect(sections.getByRole('button', { name: /База: части речи/ })).toContainText(
      '3 из 3 тем освоены',
    );
    await expect(sections.getByRole('button', { name: /Синтаксис/ })).toContainText(
      '3 из 5 тем освоены',
    );
    await expect(sections.getByRole('button', { name: /Синтаксис/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(sections.getByText('Сейчас изучаем', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Повторить', exact: true })).toContainText(
      'Определяемое слово',
    );
    for (const title of [
      'Чужой ближайший урок',
      'Чужая тема для повторения',
      'Отменённый урок программы',
    ])
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath('program-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await sections
      .getByRole('button', { name: 'Открыть материалы: Причастный оборот', exact: true })
      .click();
    const materials = page.getByRole('dialog', {
      name: 'Материалы: Причастный оборот',
      exact: true,
    });
    await expect(materials).toContainText(material.data.title);
    const fileLink = materials.getByRole('link', { name: 'Файл 1', exact: true });
    await expect(fileLink).toBeVisible();
    const actual = await context.request.get(
      new URL((await fileLink.getAttribute('href')) as string, page.url()).href,
    );
    expect(actual.ok()).toBeTruthy();
    expect(actual.headers()['content-type']).toContain('application/pdf');
    expect((await actual.body()).equals(bytes)).toBeTruthy();
    await materials.getByRole('button', { name: 'Закрыть', exact: true }).click();
    const upcoming = page.getByRole('region', { name: 'На ближайшие уроки', exact: true });
    await upcoming.getByRole('button', { name: /Закрепить причастный оборот/ }).click();
    await expect(page.getByRole('dialog')).toContainText(lesson.data.title);
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.getByRole('region', { name: 'Повторить', exact: true }).getByRole('button').click();
    await expect(
      page
        .getByRole('dialog')
        .getByRole('textbox', { name: 'Что получилось и что повторить', exact: true }),
    ).toHaveValue('Вспомнить, как находить определяемое слово в причастных оборотах.');
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.evaluate(() => {
      (window as any).programPrintCalls = 0;
      window.print = () => {
        (window as any).programPrintCalls++;
        window.dispatchEvent(new Event('beforeprint'));
      };
    });
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
    expect(await page.evaluate(() => (window as any).programPrintCalls)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.ip-print')).toBeVisible();
    await expect(page.locator('.ip-print')).toContainText('Имя существительное');
    await expect(page.locator('.ip-print')).not.toContainText('Приватная заметка');
    await expect(page.locator('.ip-print')).not.toContainText('0 из 0');
    await expect(page.locator('.ip-print')).toContainText('Запланировано · темы ещё не добавлены');
    await page.pdf({
      path: info.outputPath('individual-program.pdf'),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    for (const width of [1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBeTruthy();
      if (width === 390)
        await page.screenshot({
          path: info.outputPath('program-mobile.png'),
          fullPage: true,
          animations: 'disabled',
        });
    }
    await page.getByRole('button', { name: 'Редактировать программу', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Редактировать программу', exact: true });
    expect(await editor.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy();
    await editor.getByLabel('Тема 2.5', { exact: true }).fill('Сложное предложение: продолжение');
    await editor
      .getByRole('combobox', { name: 'Статус темы 2.5', exact: true })
      .selectOption('learning');
    await editor.getByRole('button', { name: 'Сохранить программу', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(
      sections.getByText('Сложное предложение: продолжение', { exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Занятия', exact: true }).click();
    await expect(page.getByText(lesson.data.title, { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`/students/${pupil.id}/program`);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('an existing text programme becomes editable sections without losing text; failed saves keep the draft', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const legacy = 'Синтаксис\nГрамматическая основа\nПричастный оборот\n\nОрфография\nН и НН';
  const r = await request.post('/api/v1/students', {
    data: { name: 'Демо программа из текста', program: legacy, goal: 'Разобраться в правилах' },
  });
  expect(r.ok()).toBeTruthy();
  const pupil = await r.json();
  const material = await (
    await request.post('/api/v1/records/material', {
      data: { data: { title: 'Программа: лист с упражнениями', shared: false, fileIds: [] } },
    })
  ).json();
  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`/students/${pupil.id}/program`);
    await expect(page.getByText(legacy, { exact: true })).toBeVisible();
    await expect(page.getByText('Режим занятий пока не указан', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Составить программу', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Редактировать программу', exact: true });
    await editor.getByText('Описание и прежний текст программы', { exact: true }).click();
    await editor.getByRole('button', { name: 'Создать разделы из текста', exact: true }).click();
    await expect(editor.getByLabel('Название раздела 1', { exact: true })).toHaveValue('Синтаксис');
    await editor.getByRole('combobox', { name: 'Занятий в неделю', exact: true }).selectOption('2');
    await editor.getByLabel('Продолжительность, минут', { exact: true }).fill('60');
    await editor
      .getByRole('region', { name: 'Раздел 1', exact: true })
      .getByRole('button', { name: 'Материалы к теме', exact: true })
      .first()
      .click();
    await editor.getByRole('checkbox', { name: /Программа: лист с упражнениями/ }).check();
    await editor.getByRole('button', { name: 'Добавить раздел', exact: true }).click();
    await editor.getByLabel('Название раздела 3', { exact: true }).fill('Работа с текстом');
    const section = editor.getByRole('region', { name: 'Раздел 3', exact: true });
    await section.getByRole('button', { name: 'Добавить тему', exact: true }).click();
    await editor.getByLabel('Тема 3.1', { exact: true }).fill('Главная мысль');
    await editor
      .getByRole('combobox', { name: 'Статус темы 3.1', exact: true })
      .selectOption('learning');
    await editor
      .getByRole('textbox', { name: 'Цель обучения', exact: true })
      .fill('Читать и понимать текст');
    await page.route(`**/api/v1/students/${pupil.id}`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Сохранение временно недоступно' }),
      }),
    );
    await editor.getByRole('button', { name: 'Сохранить программу', exact: true }).click();
    await expect(editor).toContainText('Сохранение временно недоступно');
    await expect(editor.getByLabel('Тема 3.1', { exact: true })).toHaveValue('Главная мысль');
    await page.unroute(`**/api/v1/students/${pupil.id}`);
    await editor.getByRole('button', { name: 'Сохранить программу', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    const saved = (await (await request.get('/api/v1/students')).json()).find(
      (value: any) => value.id === pupil.id,
    );
    expect(saved.program).toBe(legacy);
    expect(saved.goal).toBe('Читать и понимать текст');
    expect(saved.curriculum.blocks[0].topics[0].materialIds).toEqual([material.id]);
    expect(saved.curriculum.blocks[2].topics[0].status).toBe('learning');
    await expect(page.getByRole('region', { name: 'Цель обучения' })).toContainText(
      '2 занятия в неделю',
    );
    await page.screenshot({
      path: info.outputPath('program-created-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
  } finally {
    await context.close();
  }
});
