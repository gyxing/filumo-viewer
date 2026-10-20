import { expect, test } from '@playwright/test';
import { startServer } from '../helpers.mjs';
let server;
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-demo.mjs', [
    '--framework',
    'vanilla',
    '--port',
    '0',
  ]);
});
test.afterAll(async () => server?.close());
test('CSV 引号与换行显示且宽表按双向窗口定位', async ({ page }) => {
  await page.goto(server.url + '/text-expansion.html');
  await page.getByRole('button', { name: 'csv-quoted', exact: true }).click();
  await expect(
    page.locator('[data-csv-cell]').filter({ hasText: '第一行' }),
  ).toContainText('第二行');
  await expect(page.locator('.fivo-csv-heading').first()).toHaveCSS(
    'position',
    'absolute',
  );
  await page.getByRole('button', { name: 'csv-wide', exact: true }).click();
  const viewport = page.locator('.fivo-csv-viewport');
  await expect(viewport).toBeVisible();
  expect(await page.locator('[data-csv-cell]').count()).toBeLessThan(600);
  await viewport.evaluate((element) => {
    element.scrollTop = 50000;
    element.scrollLeft = 10000;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect
    .poll(() =>
      page.locator('[data-csv-cell]').first().getAttribute('data-column'),
    )
    .not.toBe('0');
  expect(await page.locator('[data-csv-cell]').count()).toBeLessThan(600);
});
