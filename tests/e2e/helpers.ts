import { expect, type Page, type APIRequestContext } from '@playwright/test';

export const teacherStorage = 'test-results/.auth/teacher.json';

export async function loginTeacher(request: APIRequestContext) {
  // Reuse the suite's teacher session instead of exhausting the real login rate limit.
  if ((await request.get('/api/v1/me')).ok()) return;
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

export async function canvasPoint(page: Page, x: number, y: number) {
  return page.locator('.canvas-paper').evaluate(
    (el, p) => {
      const n = el as HTMLElement,
        b = n.getBoundingClientRect(),
        z = parseFloat(n.style.backgroundSize) / (n.dataset.background === 'ruled' ? 32 : 24),
        [sx, sy] = n.style.backgroundPosition.split(' ').map(parseFloat);
      return { x: b.x + p.x * z + sx, y: b.y + p.y * z + sy };
    },
    { x, y },
  );
}
export async function selectCanvasObject(page: Page, e: any) {
  const p = await canvasPoint(page, e.x + e.width / 2, e.y + e.height / 2);
  await page.mouse.click(p.x, p.y);
  await expect(
    page.getByRole('complementary', { name: 'Свойства объекта', exact: true }),
  ).toBeVisible();
}
export async function editCanvasText(page: Page, e: any) {
  const p = await canvasPoint(page, e.x + e.width / 2, e.y + e.height / 2);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.getByRole('textbox', { name: 'Текст на доске', exact: true })).toBeVisible();
}
