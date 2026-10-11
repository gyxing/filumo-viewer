import { expect, test } from '@playwright/test';
import { normalizeDocsBase } from '../../../apps/docs/config/base-path.js';
import { startServer } from '../helpers.mjs';
const base = normalizeDocsBase(process.env.FIVO_DOCS_BASE);
let server;
test.beforeAll(
  async () => (server = await startServer('scripts/testing/serve-smoke.mjs')),
);
test.afterAll(async () => server?.close());
test('新烟测选择公开文件、配置更新、销毁重开和 DOM 探针', async ({
  page,
  request,
}) => {
  const response = await request.get(
    server.url + base + '__fivo_smoke/samples',
  );
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.configured).toBe(false);
  const wrongPrefix = base === '/' ? '/unconfigured/' : '/';
  const outside = await request.get(
    server.url + wrongPrefix + '__fivo_smoke/samples',
  );
  expect(outside.headers()['content-type'] ?? '').not.toContain(
    'application/json',
  );

  expect(data.samples.length).toBe(4);
  expect(data.samples.some((s) => s.id === 'basic-docx')).toBe(true);
  expect(JSON.stringify(data).includes('absolute')).toBe(false);
  await page.goto(server.url + base + 'dev/smoke-test');
  await expect(
    page.getByRole('heading', { name: 'Fivo 本地烟测' }),
  ).toBeVisible({ timeout: 60000 });
  const workerUrls = [];
  page.on('worker', (worker) => workerUrls.push(worker.url()));
  await page
    .locator('label')
    .filter({ hasText: /^Worker/ })
    .getByTitle('auto')
    .click();
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: /^always$/ })
    .click();
  const sampleRequest = page.waitForResponse((response) =>
    response.url().endsWith(base + '__fivo_smoke/files/basic-docx'),
  );
  await page.getByRole('combobox', { name: '选择烟测样本' }).click();
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: /^basic-docx \(DOCX\)$/ })
    .click();
  expect((await sampleRequest).status()).toBe(200);
  await expect(page.locator('.office-file-docx-viewer')).toBeVisible({
    timeout: 30000,
  });
  await expect
    .poll(() =>
      workerUrls.some((url) => new URL(url).pathname.startsWith(base)),
    )
    .toBe(true);
  await page
    .getByLabel('选择本机文件')
    .setInputFiles('tests/fixtures/public/generated/sample.docx');
  await expect(page.locator('.office-file-docx-viewer')).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: /销\s*毁/ }).click();
  await expect(page.getByText('已销毁，可重新打开')).toBeVisible();
  await page.getByRole('button', { name: '重新打开', exact: true }).click();
  await expect(page.locator('.office-file-docx-viewer')).toBeVisible();
  await page.getByRole('button', { name: '清空日志' }).click();
  await expect(page.getByLabel('事件日志')).toHaveText('');
});
