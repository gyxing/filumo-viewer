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
test('JSONL 坏行隔离并能继续选择 null 记录', async ({ page }) => {
  await page.goto(server.url + '/text-expansion.html');
  await page.getByRole('button', { name: 'jsonl-errors', exact: true }).click();
  const list = page.getByRole('listbox');
  await expect(list.getByRole('option')).toHaveCount(3);
  await list.getByRole('option').nth(1).click();
  await expect(list.getByRole('option').nth(1)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.fivo-text-scope:visible')).toContainText(
    'invalid',
  );
  await list.getByRole('option').nth(2).click();
  await expect(list.getByRole('option').nth(2)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.fivo-json-lines-detail')).toContainText('null');
});
