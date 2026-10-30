import { request, type FullConfig } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loginTeacher, teacherStorage } from './helpers';

export default async function setup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const context = await request.newContext({ baseURL });
  try {
    await loginTeacher(context);
    const file = path.resolve(teacherStorage);
    await mkdir(path.dirname(file), { recursive: true });
    await context.storageState({ path: file });
  } finally {
    await context.dispose();
  }
}
