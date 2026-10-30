import { test, expect } from './fixtures';
import { loginTeacher } from './helpers';

test('cancelled lines, dots and interrupted pen input do not block saving later strokes', async ({
  browser,
  request,
}) => {
  await loginTeacher(request);
  const student = await (
    await request.post('/api/v1/students', { data: { name: 'Демо сохранение штрихов' } })
  ).json();
  const room = await (await request.get(`/api/v1/classrooms/${student.classroom_id}`)).json();
  const board = await (await request.get(`/api/v1/boards/${room.board_id}`)).json();
  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [],
    invalid: any[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.url().endsWith('/operations')) return;
    for (const { element: e } of r.postDataJSON().changes)
      if (['x', 'y', 'width', 'height'].some((k) => !Number.isFinite(e[k])))
        invalid.push({
          type: e.type,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          isDeleted: e.isDeleted,
          points: e.points,
        });
  });
  await page.goto(`/lesson/${room.id}/prepare`);
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  for (const [i, name] of [
    'Одинарная — Подлежащее',
    'Волнистая — Определение',
    'Двойная — Сказуемое',
    'Пунктирная — Дополнение',
  ].entries()) {
    await page.getByRole('button', { name: 'Линии', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.mouse.click(area.x + 400, area.y + 280 + i * 60);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  for (const [dx, dy] of [
    [0, 0],
    [0, 100],
    [-120, 0],
    [150, -60],
    [-1, -1],
  ]) {
    await page.mouse.move(area.x + 700, area.y + 350);
    await page.mouse.down();
    await page.mouse.move(area.x + 700 + dx, area.y + 350 + dy, { steps: 12 });
    await page.mouse.up();
  }
  await page.mouse.move(area.x + 450, area.y + 550);
  await page.mouse.down();
  await page.mouse.move(area.x + 560, area.y + 570, { steps: 12 });
  // Finalize a pen whose pointerup was lost when the window regains focus.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.mouse.up();
  await expect
    .poll(
      async () => {
        const snapshot = await (
          await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)
        ).json();
        return snapshot.scene.filter((e: any) => e.type === 'freedraw' && !e.isDeleted).length;
      },
      { message: 'Ordinary and interrupted pen gestures must save' },
    )
    .toBe(6);
  expect(invalid).toEqual([]);
  expect(errors).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await expect(page.getByText('Некорректные координаты', { exact: true })).toHaveCount(0);
  await context.close();
});

test('a local pen draft with damaged dimensions resumes saving and keeps every valid point', async ({
  browser,
  request,
}) => {
  await loginTeacher(request);
  const me = await (await request.get('/api/v1/me')).json();
  const student = await (
    await request.post('/api/v1/students', { data: { name: 'Демо восстановление черновика' } })
  ).json();
  const room = await (await request.get(`/api/v1/classrooms/${student.classroom_id}`)).json();
  const board = await (await request.get(`/api/v1/boards/${room.board_id}`)).json();
  const context = await browser.newContext({
    storageState: await request.storageState(),
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto('/');
  const points = [
    [0, 0],
    [20, -10],
    [70, 15],
    [100, -30],
  ];
  await page.evaluate(
    async ({ key, points }) => {
      const element = {
        id: 'recover-pen-dimensions',
        type: 'freedraw',
        version: 2,
        versionNonce: 22,
        x: 180,
        y: 220,
        width: NaN,
        height: Infinity,
        angle: 0,
        points,
        pressures: [0.2, 0.4, 0.7, 0.3],
        simulatePressure: false,
        strokeColor: '#252846',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fillStyle: 'solid',
        backgroundColor: 'transparent',
        roughness: 0,
        opacity: 100,
        seed: 1,
        groupIds: [],
        frameId: null,
        boundElements: null,
        roundness: null,
        link: null,
        locked: false,
        updated: Date.now(),
        isDeleted: false,
      };
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('osnova-pending', 2);
        open.onupgradeneeded = () => {
          for (const store of ['pages', 'files'])
            if (!open.result.objectStoreNames.contains(store)) open.result.createObjectStore(store);
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('pages', 'readwrite');
          tx.objectStore('pages').put(
            {
              elements: [element],
              base: [],
              files: {},
              pending: {
                id: crypto.randomUUID(),
                changes: [{ element, baseVersion: null }],
              },
            },
            key,
          );
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { key: `${me.id}:${board.canvas_page_id}`, points },
  );
  await page.goto(`/lesson/${room.id}/prepare`);
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  const snapshot = async () =>
    (await (await request.get(`/api/v1/pages/${board.canvas_page_id}/snapshot`)).json())
      .scene as any[];
  await expect
    .poll(async () => (await snapshot()).find((e) => e.id === 'recover-pen-dimensions')?.width)
    .toBe(100);
  const restored = (await snapshot()).find((e) => e.id === 'recover-pen-dimensions')!;
  expect(restored.height).toBe(45);
  expect(restored.points).toEqual(points);
  expect(restored.pressures).toEqual([0.2, 0.4, 0.7, 0.3]);
  await page.getByRole('button', { name: 'Ручка', exact: true }).click();
  const area = (await page.locator('.lesson-board-area').boundingBox())!;
  await page.mouse.move(area.x + 450, area.y + 500);
  await page.mouse.down();
  await page.mouse.move(area.x + 650, area.y + 530, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(
      async () => (await snapshot()).filter((e) => e.type === 'freedraw' && !e.isDeleted).length,
    )
    .toBe(2);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ручка', exact: true })).toBeEnabled();
  await expect(page.getByText('Некорректные координаты', { exact: true })).toHaveCount(0);
  expect((await snapshot()).find((e) => e.id === restored.id)?.points).toEqual(points);
  expect((await snapshot()).filter((e) => e.type === 'freedraw' && !e.isDeleted)).toHaveLength(2);
  await context.close();
});
