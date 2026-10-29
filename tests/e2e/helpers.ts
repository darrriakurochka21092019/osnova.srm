import { expect, type Page, type APIRequestContext } from '@playwright/test';

export async function loginTeacher(request: APIRequestContext) {
  const bootstrap = await (await request.get('/api/v1/bootstrap')).json();
  const data = {
    name: 'Демо-преподаватель',
    email: 'teacher@example.test',
    password: 'teacher-test-password',
  };
  const response = await request.post(`/api/v1/auth/${bootstrap.setupNeeded ? 'setup' : 'login'}`, {
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await request.patch('/api/v1/me', { data: { settings: { onboardingComplete: true } } });
}

export async function selectPresentation(page: Page, title?: string) {
  const handle = page
    .getByRole('button', {
      name: title ? `Выделить презентацию: ${title}` : /^Выделить презентацию:/,
    })
    .first();
  await expect(handle).toBeAttached();
  await handle.focus();
  await handle.press('Enter');
  await expect(page.locator('.presentation-controls')).toHaveCount(1);
}
export async function addNote(page: Page) {
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await page.getByRole('button', { name: 'Заметка', exact: true }).click();
  await page.getByRole('button', { name: 'Жёлтый стикер', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Текст на доске', exact: true });
  await input.fill('Заметка урока');
  await input.press('Control+Enter');
}
