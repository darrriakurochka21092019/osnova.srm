import { test, expect } from './fixtures';
import { loginTeacher } from './helpers';

test('students shows actual programmes, next lessons, homework and groups with working filters on desktop and mobile', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const post = async (url: string, data: unknown) => {
    const response = await request.post(`/api/v1${url}`, { data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const pupils = [];
  for (const [name, grade, program, color, status] of [
    ['Ученики Саша', '9 класс', 'ОГЭ по русскому', 'blue', 'active'],
    ['Ученики Миша', '7 класс', 'Школьная программа', 'mint', 'active'],
    ['Ученики Таня', '6 класс', 'Школьная программа', 'peach', 'active'],
    ['Ученики Оля', '11 класс', 'ЕГЭ по русскому', 'purple', 'paused'],
  ])
    pupils.push(
      await post('/students', { name, grade, program, color, status, subject: 'Русский язык' }),
    );
  const tomorrow = new Date(Date.now() + 27 * 3600000).toISOString().slice(0, 10);
  const nextDay = new Date(Date.now() + 51 * 3600000).toISOString().slice(0, 10);
  const lesson = (
    studentId: string,
    title: string,
    start: string,
    extra: Record<string, unknown> = {},
  ) =>
    post('/records/lesson', {
      studentId,
      data: {
        title,
        start,
        duration: 60,
        price: 1500,
        status: 'planned',
        subject: 'Русский язык',
        ...extra,
      },
    });
  await lesson(pupils[0].id, 'Ученики: ближайший урок', `${tomorrow}T16:00:00+03:00`);
  await lesson(pupils[0].id, 'Ученики: отменённое занятие', `${tomorrow}T15:00:00+03:00`, {
    status: 'cancelled',
  });
  const group = await post('/classrooms', { studentIds: [pupils[0].id, pupils[1].id] });
  await lesson(pupils[0].id, 'Ученики: групповое занятие', `${nextDay}T17:30:00+03:00`, {
    studentIds: [pupils[1].id],
  });
  for (const [index, status] of [
    [0, 'submitted'],
    [1, 'assigned'],
    [2, 'reviewed'],
  ] as const) {
    await post('/records/homework', {
      studentId: pupils[index].id,
      data: {
        title: `Ученики: работа ${index}`,
        description: 'Задание для проверки статуса',
        due: `${nextDay}T21:00:00+03:00`,
        status,
      },
    });
  }
  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1586, height: 992 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/students');
  await expect(page.getByRole('heading', { name: 'Ученики', exact: true })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Имя ученика', exact: true });
  const grade = page.getByRole('combobox', { name: 'Класс', exact: true });
  const program = page.getByRole('combobox', { name: 'Программа', exact: true });
  const table = page.getByRole('table', { name: 'Список учеников', exact: true });
  const rows = () => table.getByRole('row').filter({ hasText: 'Ученики ' });
  const row = (name: string) => table.getByRole('row').filter({ hasText: name });
  await search.fill('Ученики ');
  await expect(rows()).toHaveCount(3);
  await expect(row('Ученики Саша')).toContainText('ОГЭ по русскому');
  await expect(row('Ученики Саша')).toContainText('16:00');
  await expect(row('Ученики Саша')).not.toContainText('15:00');
  await expect(row('Ученики Саша')).toContainText('На проверке');
  await expect(row('Ученики Миша')).toContainText('Выдано');
  await expect(row('Ученики Таня')).toContainText('Проверено');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath('students-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await grade.selectOption('9 класс');
  await expect(rows()).toHaveCount(1);
  await expect(rows()).toContainText('Ученики Саша');
  await grade.selectOption('');
  await program.selectOption('Школьная программа');
  await expect(rows()).toHaveCount(2);
  await program.selectOption('');
  await search.fill('  уЧеНиКи сАшА  ');
  await expect(rows()).toHaveCount(1);
  await search.fill('Нет такого ученика');
  await expect(rows()).toHaveCount(0);
  await search.fill('Ученики ');
  await page.getByRole('tab', { name: /^Архив/ }).click();
  await expect(rows()).toHaveCount(1);
  await expect(rows()).toContainText('Ученики Оля');
  await expect(rows()).not.toContainText('Ученики Саша');
  await page.getByRole('tab', { name: /^Ученики/ }).click();
  await expect(rows()).toHaveCount(3);
  await page.getByRole('tab', { name: /^Мини-группы/ }).click();
  const groupLink = page.getByRole('link').filter({ hasText: group.title }).first();
  await expect(groupLink).toBeVisible();
  await expect(groupLink).toContainText('17:30');
  await groupLink.click();
  await expect(page).toHaveURL(new RegExp(`/lesson/${group.id}(?:\\?.*)?$`));
  await page.goto('/students');
  await search.fill('Ученики ');
  for (const width of [1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 760 ? 844 : 992 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    ).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Добавить ученика', exact: true })).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: info.outputPath('students-mobile.png'),
        fullPage: true,
        animations: 'disabled',
      });
  }
  await page.setViewportSize({ width: 1586, height: 992 });
  await row('Ученики Саша')
    .getByRole('link', { name: /Карточка/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/students/${pupils[0].id}$`));
  await expect(page.getByRole('heading', { name: 'Ученики Саша', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('students can be added, edited, paused in the archive and restored without losing their cards', async ({
  browser,
  request,
}) => {
  await loginTeacher(request);
  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto('/students');
  await page.getByRole('button', { name: 'Добавить ученика', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Новый ученик', exact: true });
  await editor.getByLabel('Имя ученика', { exact: true }).fill('Ученики Новый');
  await editor.getByLabel('Класс', { exact: true }).fill('8 класс');
  await editor.getByLabel('Индивидуальная программа', { exact: true }).fill('Школьная программа');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const search = page.getByRole('textbox', { name: 'Имя ученика', exact: true });
  const table = page.getByRole('table', { name: 'Список учеников', exact: true });
  await search.fill('Ученики Новый');
  let row = table.getByRole('row').filter({ hasText: 'Ученики Новый' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Действия: Ученики Новый', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Изменить', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Карточка ученика', exact: true });
  await editor.getByLabel('Имя ученика', { exact: true }).fill('Ученики Изменённый');
  await editor.getByLabel('Класс', { exact: true }).fill('10 класс');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await search.fill('Ученики Изменённый');
  row = table.getByRole('row').filter({ hasText: 'Ученики Изменённый' });
  await expect(row).toContainText('10 класс');
  await row.getByRole('button', { name: 'Действия: Ученики Изменённый', exact: true }).click();
  await page.getByRole('menuitem', { name: 'В архив', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('tab', { name: /^Архив/ }).click();
  await expect(row).toBeVisible();
  const pupils = await (await request.get('/api/v1/students')).json();
  const pupil = pupils.find((student: { name: string }) => student.name === 'Ученики Изменённый');
  expect(pupil.status).toBe('paused');
  await row.getByRole('button', { name: 'Действия: Ученики Изменённый', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Вернуть из архива', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('tab', { name: /^Ученики/ }).click();
  await expect(row).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/v1/students')).json()).find(
          (student: { id: string }) => student.id === pupil.id,
        ).status,
    )
    .toBe('active');
  await context.close();
});

test('students supports pagination, sorting, keyboard tabs and confirmed bulk archive across pages', async ({
  browser,
  request,
}) => {
  await loginTeacher(request);
  const pupils = [];
  for (const number of [6, 2, 5, 1, 4, 3]) {
    const response = await request.post('/api/v1/students', {
      data: {
        name: `Пагинация ${number}`,
        grade: '8 класс',
        program: 'Проверка пагинации',
        goal: 'Сохранить данные при смене статуса',
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    pupils.push(await response.json());
  }
  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1586, height: 992 },
  });
  const page = await context.newPage();
  await page.goto('/students');
  await page.getByRole('textbox', { name: 'Имя ученика', exact: true }).fill('Пагинация ');
  const table = page.getByRole('table', { name: 'Список учеников', exact: true });
  const rows = () => table.getByRole('row').filter({ hasText: 'Пагинация ' });
  const next = page.getByRole('button', { name: 'Следующая страница учеников', exact: true });
  const previous = page.getByRole('button', { name: 'Предыдущая страница учеников', exact: true });
  await expect(rows()).toHaveCount(5);
  await expect(page.getByText('Показано 5 из 6 учеников', { exact: true })).toBeVisible();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(rows()).toHaveCount(1);
  await expect(rows()).toContainText('Пагинация 3');
  await expect(next).toBeDisabled();
  await previous.click();

  const nameHeading = table.getByRole('columnheader', { name: 'Ученик', exact: true });
  await nameHeading.getByRole('button', { name: 'Ученик', exact: true }).click();
  await expect(nameHeading).toHaveAttribute('aria-sort', 'ascending');
  await expect(rows()).toContainText([
    'Пагинация 1',
    'Пагинация 2',
    'Пагинация 3',
    'Пагинация 4',
    'Пагинация 5',
  ]);
  await nameHeading.getByRole('button', { name: 'Ученик', exact: true }).click();
  await expect(nameHeading).toHaveAttribute('aria-sort', 'descending');
  await expect(rows()).toContainText([
    'Пагинация 6',
    'Пагинация 5',
    'Пагинация 4',
    'Пагинация 3',
    'Пагинация 2',
  ]);

  const studentsTab = page.getByRole('tab', { name: /^Ученики/ });
  const groupsTab = page.getByRole('tab', { name: /^Мини-группы/ });
  const archiveTab = page.getByRole('tab', { name: /^Архив/ });
  await studentsTab.focus();
  await expect(studentsTab).toHaveAttribute('tabindex', '0');
  await expect(groupsTab).toHaveAttribute('tabindex', '-1');
  await studentsTab.press('ArrowRight');
  await expect(groupsTab).toHaveAttribute('aria-selected', 'true');
  await expect(groupsTab).toBeFocused();
  await expect(groupsTab).toHaveAttribute('tabindex', '0');
  await expect(studentsTab).toHaveAttribute('tabindex', '-1');
  await groupsTab.press('End');
  await expect(archiveTab).toHaveAttribute('aria-selected', 'true');
  await expect(archiveTab).toBeFocused();
  await archiveTab.press('Home');
  await expect(studentsTab).toHaveAttribute('aria-selected', 'true');
  await expect(studentsTab).toBeFocused();
  await studentsTab.press('ArrowLeft');
  await expect(archiveTab).toBeFocused();
  await archiveTab.press('ArrowRight');
  await expect(studentsTab).toBeFocused();
  await expect(rows()).toHaveCount(5);

  await page.setViewportSize({ width: 390, height: 844 });
  const region = page.getByRole('region', { name: 'Таблица учеников', exact: true });
  const box = await region.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(
    await region.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBeTruthy();
  await region.evaluate((element) => {
    element.scrollLeft = 500;
  });
  expect(await region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1586, height: 992 });

  const selectPage = page.getByRole('checkbox', { name: 'Выбрать всех на странице', exact: true });
  await selectPage.check();
  await expect(page.getByRole('status').filter({ hasText: 'Выбрано: 5' })).toBeVisible();
  await next.click();
  await expect(rows()).toHaveCount(1);
  await expect(selectPage).not.toBeChecked();
  await selectPage.check();
  await expect(page.getByRole('status').filter({ hasText: 'Выбрано: 6' })).toBeVisible();
  await page.getByRole('button', { name: 'В архив', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Переместить в архив?', exact: true });
  await expect(confirm).toContainText('История уроков, задания и материалы сохранятся');
  const ids = new Set(pupils.map((pupil: { id: string }) => pupil.id));
  const ownPupils = async () =>
    (await (await request.get('/api/v1/students')).json()).filter((pupil: { id: string }) =>
      ids.has(pupil.id),
    );
  expect(
    (await ownPupils()).every((pupil: { status: string }) => pupil.status === 'active'),
  ).toBeTruthy();
  await confirm.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rows()).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await ownPupils()).filter((pupil: { status: string }) => pupil.status === 'paused').length,
    )
    .toBe(6);
  const saved = await ownPupils();
  expect(saved).toHaveLength(6);
  for (const pupil of saved) {
    expect(pupil.grade).toBe('8 класс');
    expect(pupil.program).toBe('Проверка пагинации');
    expect(pupil.goal).toBe('Сохранить данные при смене статуса');
    expect(pupil.classroom_id).toBeTruthy();
  }
  await archiveTab.click();
  await expect(rows()).toHaveCount(5);
  await next.click();
  await expect(rows()).toHaveCount(1);
  await context.close();
});
