import { expect, type APIRequestContext } from '@playwright/test';

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
