import { test, expect } from './fixtures';
import { loginTeacher } from './helpers';

test('student detail shows isolated real lessons, homework, results, notes and payments with working actions', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const post = async (url: string, data: unknown) => {
    const response = await request.post(`/api/v1${url}`, { data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const pupil = await post('/students', {
    name: 'Карточка Саша',
    grade: '9 класс',
    subject: 'Русский язык',
    goal: 'Сдать ОГЭ по русскому на пятёрку',
    program: 'Синтаксис\nПунктуация\nПодготовка к изложению',
    color: 'blue',
  });
  const other = await post('/students', {
    name: 'Другой участник',
    grade: '8 класс',
    subject: 'Русский язык',
    goal: 'Чужая учебная цель',
    program: 'Чужая индивидуальная программа',
  });
  const instant = Date.now();
  const at = (days: number) => new Date(instant + days * 86_400_000).toISOString();
  const lesson = (
    studentId: string,
    title: string,
    start: string,
    status: string,
    extra: Record<string, unknown> = {},
  ) =>
    post('/records/lesson', {
      studentId,
      data: { title, start, status, duration: 60, price: 1000, subject: 'Русский язык', ...extra },
    });
  for (let index = 1; index <= 4; index++) {
    await lesson(pupil.id, `Деталь: проведённый ${index}`, at(index - 6), 'completed');
  }
  await lesson(other.id, 'Деталь: проведённый групповой', at(-1), 'completed', {
    price: 500,
    studentIds: [pupil.id],
  });
  await lesson(other.id, 'Чужое проведённое занятие', at(-0.5), 'completed', { price: 8000 });
  await lesson(pupil.id, 'Деталь: будущий индивидуальный', at(2), 'planned');
  await lesson(pupil.id, 'Деталь: отменённый', at(0.5), 'cancelled', { price: 9999 });
  const next = await lesson(pupil.id, 'Деталь: ближайший групповой', at(1), 'rescheduled', {
    studentIds: [other.id],
  });
  const group = await post(`/lessons/${next.id}/classroom`, {});
  const homework = [];
  for (const [index, status] of ['submitted', 'assigned', 'reviewed'].entries()) {
    homework.push(
      await post('/records/homework', {
        studentId: pupil.id,
        data: {
          title: `Деталь: домашняя работа ${index + 1}`,
          description: 'Выполнить упражнения',
          due: at(3),
          status,
        },
      }),
    );
  }
  await post('/records/homework', {
    studentId: other.id,
    data: {
      title: 'Чужая домашняя работа',
      description: 'Не показывать в чужой карточке',
      due: at(3),
      status: 'submitted',
    },
  });
  await post('/records/result', {
    studentId: pupil.id,
    data: {
      title: 'Деталь: прежний результат',
      date: at(-5),
      score: 7,
      maxScore: 10,
      topic: 'Синтаксис',
      recommendation: 'Повторить правила',
      skill: 'repeat',
    },
  });
  await post('/records/result', {
    studentId: pupil.id,
    data: {
      title: 'Деталь: последний результат',
      date: at(-1),
      score: 18,
      maxScore: 20,
      topic: 'Пунктуация',
      recommendation: 'Хорошая работа',
      skill: 'mastered',
    },
  });
  await post('/records/result', {
    studentId: other.id,
    data: {
      title: 'Чужой результат',
      date: at(0),
      score: 1,
      maxScore: 10,
      topic: 'Другая тема',
      skill: 'learning',
    },
  });
  await post('/records/note', {
    studentId: pupil.id,
    data: {
      title: 'Деталь: заметка преподавателя',
      text: 'Повторить пунктуацию перед следующим уроком',
    },
  });
  await post('/records/note', {
    studentId: other.id,
    data: { title: 'Чужая приватная заметка', text: 'Этого нет в карточке Саши' },
  });
  await post('/records/transaction', {
    studentId: pupil.id,
    data: { title: 'Деталь: оплата уроков', date: at(-2), amount: 5000, type: 'payment' },
  });
  await post('/records/transaction', {
    studentId: pupil.id,
    data: { title: 'Деталь: прочий доход', date: at(-1), amount: 20000, type: 'income' },
  });
  await post('/records/transaction', {
    studentId: other.id,
    data: { title: 'Чужая оплата', date: at(-1), amount: 50000, type: 'payment' },
  });
  await post('/records/document', {
    studentId: pupil.id,
    data: { title: 'Деталь: договор', type: 'contract', status: 'signed', fileIds: [] },
  });
  await post('/records/document', {
    studentId: other.id,
    data: { title: 'Чужой договор', type: 'contract', status: 'signed', fileIds: [] },
  });

  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1586, height: 992 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const open = () => page.goto(`/students/${pupil.id}`);
  await open();
  await expect(page.getByRole('heading', { name: pupil.name, exact: true })).toBeVisible();
  const hero = page.getByRole('region', { name: 'Следующий урок', exact: true });
  const goal = page.getByRole('region', { name: 'Учебная цель', exact: true });
  const recent = page.getByRole('region', { name: 'Последние занятия', exact: true });
  const work = page.getByRole('region', { name: 'Домашняя работа', exact: true });
  const notes = page.getByRole('region', { name: 'Заметки преподавателя', exact: true });
  const payment = page.getByRole('region', { name: 'Оплата', exact: true });
  await expect(hero).toContainText('Деталь: ближайший групповой');
  await expect(hero).not.toContainText('Деталь: отменённый');
  await expect(goal).toContainText(pupil.goal);
  await expect(
    goal.getByRole('progressbar', { name: 'Последний результат', exact: true }),
  ).toHaveAttribute('aria-valuenow', '90');
  await expect(recent.getByText('Деталь: проведённый групповой', { exact: true })).toBeVisible();
  await expect(recent.getByText('Деталь: проведённый 4', { exact: true })).toBeVisible();
  await expect(recent.getByText('Деталь: проведённый 3', { exact: true })).toBeVisible();
  await expect(recent.getByText('Деталь: проведённый 2', { exact: true })).toHaveCount(0);
  await expect(recent.getByText('Деталь: проведённый 1', { exact: true })).toHaveCount(0);
  await expect(work).toContainText('Ожидает проверки');
  await expect(work).toContainText('Выдано');
  await expect(work.getByText(homework[0].data.title, { exact: true })).toBeVisible();
  await expect(work.getByText(homework[1].data.title, { exact: true })).toBeVisible();
  await expect(work.getByText(homework[2].data.title, { exact: true })).toHaveCount(0);
  await expect(notes).toContainText('Повторить пунктуацию перед следующим уроком');
  // Five completed lessons cost 4,500 RUB; only the pupil's payment contributes 5,000 RUB.
  await expect(payment).toContainText(/Аванс\s+500\s*₽/);
  for (const title of [
    'Чужая учебная цель',
    'Чужая приватная заметка',
    'Чужая домашняя работа',
    'Чужое проведённое занятие',
  ]) {
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath('student-detail-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  for (const width of [1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 760 ? 844 : 992 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    ).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Начать урок', exact: true })).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: info.outputPath('student-detail-mobile.png'),
        fullPage: true,
        animations: 'disabled',
      });
  }
  await page.setViewportSize({ width: 1586, height: 992 });

  await page.getByRole('tab', { name: 'Программа', exact: true }).click();
  await expect(page.getByText(pupil.program, { exact: true })).toBeVisible();
  await expect(page.getByText(other.program, { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Занятия', exact: true }).click();
  await expect(page.getByText('Деталь: будущий индивидуальный', { exact: true })).toBeVisible();
  await expect(page.getByText('Деталь: ближайший групповой', { exact: true })).toBeVisible();
  await expect(page.getByText('Чужое проведённое занятие', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Работы', exact: true }).click();
  await expect(page.getByText(homework[0].data.title, { exact: true })).toBeVisible();
  await expect(page.getByText(homework[2].data.title, { exact: true })).toBeVisible();
  await expect(page.getByText('Проверено', { exact: true })).toBeVisible();
  await expect(page.getByText('Чужая домашняя работа', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Прогресс', exact: true }).click();
  await expect(page.getByText('Деталь: последний результат', { exact: true })).toBeVisible();
  await expect(page.getByText('Чужой результат', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Документы', exact: true }).click();
  await expect(page.getByText('Деталь: договор', { exact: true })).toBeVisible();
  await expect(page.getByText('Чужой договор', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Обзор', exact: true }).click();

  await notes.getByRole('button', { name: 'Добавить заметку', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Добавить: заметка', exact: true });
  await editor.getByLabel('Название', { exact: true }).fill('Деталь: новая заметка');
  await editor
    .getByRole('textbox', { name: 'Заметка', exact: true })
    .fill('Согласовать план занятий');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(notes).toContainText('Согласовать план занятий');
  await notes
    .getByRole('button', { name: 'Редактировать заметку: Деталь: новая заметка', exact: true })
    .click();
  editor = page.getByRole('dialog', { name: 'Изменить: заметка', exact: true });
  await editor
    .getByRole('textbox', { name: 'Заметка', exact: true })
    .fill('План согласован с учеником');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(notes).toContainText('План согласован с учеником');
  const savedNote = (await (await request.get('/api/v1/records/note')).json()).find(
    (entry: any) => entry.data.title === 'Деталь: новая заметка',
  );
  expect(savedNote.student_id).toBe(pupil.id);
  expect(savedNote.data.text).toBe('План согласован с учеником');

  await payment.getByRole('button', { name: 'Открыть расчёты', exact: true }).click();
  const finances = page.getByRole('dialog', { name: 'Расчёты с учеником', exact: true });
  await expect(finances).toContainText('Деталь: оплата уроков');
  await expect(finances).not.toContainText('Чужая оплата');
  await expect(
    finances.getByRole('button', { name: 'Добавить оплату', exact: true }),
  ).toBeVisible();
  await finances.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await work.getByRole('link', { name: 'Проверить', exact: true }).click();
  await expect(page).toHaveURL(`/homework/${homework[0].id}`);
  await expect(
    page.getByRole('heading', { name: homework[0].data.title, exact: true }),
  ).toBeVisible();
  await open();
  await page.getByRole('button', { name: 'Дополнительные действия', exact: true }).click();
  for (const name of [
    'Изменить карточку',
    'Ссылка на занятия',
    'Настроить вход ученика',
    'Запланировать урок',
    'Добавить результат',
    'Уведомить ученика',
  ]) {
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('menuitem', { name: 'Изменить карточку', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Карточка ученика', exact: true });
  await expect(editor.getByLabel('Имя ученика', { exact: true })).toHaveValue(pupil.name);
  await editor.getByRole('button', { name: 'Закрыть', exact: true }).click();

  await hero.getByRole('button', { name: 'Открыть доску', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/board/${group.board_id}\\?lesson=${next.id}$`));
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await open();
  await hero.getByRole('button', { name: 'Подготовить урок', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lesson/${group.id}/prepare\\?lesson=${next.id}$`));
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await open();
  await page.getByRole('button', { name: 'Начать урок', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lesson/${group.id}\\?lesson=${next.id}$`));
  await expect(page.getByRole('heading', { name: 'Готовы начать?', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('an empty student detail shows no fabricated results and assigns homework to that pupil', async ({
  browser,
  request,
}, info) => {
  await loginTeacher(request);
  const response = await request.post('/api/v1/students', {
    data: { name: 'Пустая карточка', grade: '7 класс', subject: 'Математика' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const pupil = await response.json();
  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1586, height: 992 },
  });
  const page = await context.newPage();
  await page.goto(`/students/${pupil.id}`);
  await expect(page.getByRole('heading', { name: pupil.name, exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Следующий урок', exact: true })).toContainText(
    'Нет запланированных занятий',
  );
  await expect(
    page.getByRole('region', { name: 'Учебная цель', exact: true }).getByRole('progressbar'),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('region', { name: 'Заметки преподавателя', exact: true })
      .getByRole('button', { name: /^Редактировать заметку:/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Оплата', exact: true })).toContainText(
    'Оплат пока нет',
  );
  await expect(
    page
      .getByRole('region', { name: 'Домашняя работа', exact: true })
      .getByRole('link', { name: 'Проверить', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath('student-detail-empty.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Назначить задание', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Добавить: задание', exact: true });
  await expect(editor.getByRole('combobox', { name: 'Ученик', exact: true })).toHaveValue(pupil.id);
  await editor.getByLabel('Название', { exact: true }).fill('Деталь: задание из пустой карточки');
  await editor.getByLabel('Инструкция', { exact: true }).fill('Решить пять уравнений');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/v1/records/homework')).json()).find(
          (entry: any) => entry.data.title === 'Деталь: задание из пустой карточки',
        )?.student_id,
    )
    .toBe(pupil.id);
  await expect(page.getByRole('region', { name: 'Домашняя работа', exact: true })).toContainText(
    'Деталь: задание из пустой карточки',
  );
  await context.close();
});
