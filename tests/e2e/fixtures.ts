import { test as base } from '@playwright/test';
import { teacherStorage } from './helpers';

// Only the teacher API fixture shares authentication. Browser contexts used for
// guests and pupils stay independent and unauthenticated until their own login.
export const test = base.extend({
  request: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({
      baseURL,
      storageState: teacherStorage,
    });
    try {
      await use(context);
    } finally {
      await context.dispose();
    }
  },
});
export { expect } from '@playwright/test';
