import { test, expect } from './fixtures';
import { loginTeacher } from './helpers';

test('schedule keeps Moscow dates, pupil filters and lesson actions working in the redesigned calendar', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const post = async (url: string, data: unknown) => {
    const response = await request.post(`/api/v1${url}`, { data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const sasha = await post('/students', {
    name: 'Расписание Саша',
    grade: '9 класс',
    subject: 'Русский язык',
  });
  const misha = await post('/students', {
    name: 'Расписание Миша',
    grade: '7 класс',
    subject: 'Русский язык',
  });
  const lesson = async (
    title: string,
    start: string,
    status = 'planned',
    extra: Record<string, unknown> = {},
  ) =>
    post('/records/lesson', {
      studentId: sasha.id,
      data: {
        title,
        start,
        duration: 60,
        price: 1500,
        subject: 'Русский язык',
        status,
        ...extra,
      },
    });
  const individual = await lesson('Расписание: причастный оборот', '2026-10-27T16:00:00+03:00');
  await lesson('Расписание: подготовка ОГЭ', '2026-10-27T17:30:00+03:00', 'planned', {
    studentIds: [misha.id],
    duration: 90,
  });
  await lesson('Расписание: отменённый урок', '2026-10-27T20:00:00+03:00', 'cancelled');
  await lesson('Расписание: перенос занятия', '2026-10-28T18:00:00+03:00', 'rescheduled');

  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1586, height: 992 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'Расписание', exact: true })).toBeVisible();
  const date = page.getByLabel('Выбрать дату', { exact: true });
  const filter = page.getByLabel('Ученики в расписании', { exact: true });
  const calendar = page.getByRole('region', { name: 'Календарь занятий', exact: true });
  const cards = page.locator('.calendar-event').filter({ hasText: 'Расписание:' });
  const individualCard = () => cards.filter({ hasText: 'Расписание: причастный оборот' });
  await date.fill('2026-10-27');
  await expect(page.getByRole('button', { name: 'Неделя', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(cards).toHaveCount(4);
  await expect(individualCard()).toContainText('16:00–17:00');
  await expect(individualCard()).toContainText('Расписание Саша');
  await expect(cards.filter({ hasText: 'подготовка ОГЭ' })).toHaveClass(/group/);
  await expect(cards.filter({ hasText: 'перенос занятия' })).toHaveClass(/rescheduled/);
  await expect(cards.filter({ hasText: 'отменённый урок' })).toHaveClass(/cancelled/);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('schedule-desktop.png'), fullPage: true });

  await individualCard().click();
  const detail = () => page.getByRole('dialog', { name: 'Урок: Расписание: причастный оборот' });
  await expect(detail()).toContainText('Русский язык');
  await expect(detail()).toContainText('60 минут');
  await expect(detail().getByRole('button', { name: 'Открыть урок', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('schedule-lesson-popover.png'), fullPage: false });
  await expect(detail()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail()).toHaveCount(0);

  // A pupil selected as an additional group member must still see the group lesson.
  await filter.selectOption(misha.id);
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('подготовка ОГЭ');
  await cards.click();
  const group = page.getByRole('dialog', { name: 'Урок: Расписание: подготовка ОГЭ' });
  await expect(group).toContainText('Расписание Саша');
  await expect(group).toContainText('Расписание Миша');
  await group.getByRole('button', { name: 'Закрыть карточку урока', exact: true }).click();
  expect(await calendar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Месяц', exact: true }).click();
  await expect.poll(() => calendar.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator('.month-event').filter({ hasText: 'Расписание:' })).toHaveCount(1);
  await filter.selectOption('');
  await expect(page.locator('.month-event').filter({ hasText: 'Расписание:' })).toHaveCount(4);
  await page.getByRole('button', { name: 'День', exact: true }).click();
  await expect(cards).toHaveCount(3);
  await page.getByRole('button', { name: 'Следующий период', exact: true }).click();
  await expect(date).toHaveValue('2026-10-28');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('перенос занятия');
  await page.getByRole('button', { name: 'Предыдущий период', exact: true }).click();
  await expect(date).toHaveValue('2026-10-27');
  await expect(cards).toHaveCount(3);

  await cards.filter({ hasText: 'отменённый урок' }).click();
  const cancelled = page.getByRole('dialog', { name: 'Урок: Расписание: отменённый урок' });
  await expect(cancelled.getByRole('button', { name: 'Открыть урок', exact: true })).toBeDisabled();
  await cancelled.getByRole('button', { name: 'Закрыть карточку урока', exact: true }).click();

  for (const width of [1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 760 ? 844 : 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    ).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Добавить урок', exact: true })).toBeVisible();
    if (width === 390) {
      await individualCard().click();
      await expect(detail()).toBeVisible();
      const box = await detail().boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath('schedule-mobile.png'), fullPage: false });
      await expect(detail()).toBeVisible();
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Неделя', exact: true }).click();
      await expect(cards).toHaveCount(4);
      const calendarBox = await calendar.boundingBox();
      expect(calendarBox!.x).toBeGreaterThanOrEqual(0);
      expect(calendarBox!.x + calendarBox!.width).toBeLessThanOrEqual(width);
      expect(
        await calendar.evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBeTruthy();
      await calendar.evaluate((element) => {
        element.scrollLeft = 200;
      });
      expect(await calendar.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBeTruthy();
      await page.screenshot({ path: info.outputPath('schedule-mobile-week.png'), fullPage: true });
      await page.getByRole('button', { name: 'День', exact: true }).click();
    }
  }

  await page.setViewportSize({ width: 1586, height: 992 });
  await individualCard().click();
  await detail().getByRole('button', { name: 'Изменить', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Изменить: урок' })).toBeVisible();
  await page.getByLabel('Длительность, минут', { exact: true }).fill('75');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(individualCard()).toContainText('16:00–17:15');
  await expect
    .poll(async () => {
      const entries = await (await request.get('/api/v1/records/lesson')).json();
      return entries.find((entry: any) => entry.id === individual.id).data.duration;
    })
    .toBe(75);

  await page.getByRole('button', { name: 'Добавить урок', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Добавить: урок' })).toBeVisible();
  await expect(page.getByLabel('Начало · московское время', { exact: true })).toHaveValue(
    '2026-10-27T16:00',
  );
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await individualCard().click();
  await detail().getByRole('button', { name: 'Открыть урок', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/lesson/${sasha.classroom_id}\\?lesson=${individual.id}$`),
  );
  await expect(page.getByRole('heading', { name: 'Готовы начать?', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('schedule month navigation does not skip February when the selected date is January 31', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ storageState: await request.storageState() });
  const page = await context.newPage();
  await page.goto('/schedule');
  const date = page.getByLabel('Выбрать дату', { exact: true });
  await date.fill('2026-01-31');
  await page.getByRole('button', { name: 'Месяц', exact: true }).click();
  await page.getByRole('button', { name: 'Следующий период', exact: true }).click();
  await expect(date).toHaveValue(/^2026-02-/);
  await page.getByRole('button', { name: 'Предыдущий период', exact: true }).click();
  await expect(date).toHaveValue(/^2026-01-/);
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(date).toHaveValue(new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10));
  await context.close();
});

test('a lesson continuing after Moscow midnight initially opens the day at the beginning', async ({
  browser,
  request,
}) => {
  const pupilResponse = await request.post('/api/v1/students', {
    data: { name: 'Ночной урок', subject: 'Математика' },
  });
  expect(pupilResponse.ok(), await pupilResponse.text()).toBeTruthy();
  const pupil = await pupilResponse.json();
  const lessonResponse = await request.post('/api/v1/records/lesson', {
    data: {
      studentId: pupil.id,
      data: {
        title: 'Продолжение после полуночи',
        subject: 'Математика',
        start: '2026-10-28T23:30:00+03:00',
        duration: 120,
        price: 1500,
        status: 'planned',
      },
    },
  });
  expect(lessonResponse.ok(), await lessonResponse.text()).toBeTruthy();
  const context = await browser.newContext({ storageState: await request.storageState() });
  const page = await context.newPage();
  await page.goto('/schedule');
  await page.getByLabel('Выбрать дату', { exact: true }).fill('2026-10-29');
  await page.getByRole('button', { name: 'День', exact: true }).click();
  await expect(
    page.locator('.calendar-event').filter({ hasText: 'Продолжение после полуночи' }),
  ).toHaveCount(1);
  const calendar = page.getByRole('region', { name: 'Календарь занятий', exact: true });
  await expect.poll(() => calendar.evaluate((element) => element.scrollTop)).toBe(0);
  await context.close();
});
