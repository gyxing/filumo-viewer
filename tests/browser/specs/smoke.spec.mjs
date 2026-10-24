import { expect, test } from '@playwright/test';
import { normalizeDocsBase } from '../../../apps/docs/config/base-path.js';
import { sampleCatalog } from '../../../scripts/testing/sample-catalog.js';
import { startServer } from '../helpers.mjs';
const base = normalizeDocsBase(process.env.FILUMO_DOCS_BASE);
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
    server.url + base + '__filumo_smoke/samples',
  );
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.configured).toBe(false);
  const wrongPrefix = base === '/' ? '/unconfigured/' : '/';
  const outside = await request.get(
    server.url + wrongPrefix + '__filumo_smoke/samples',
  );
  expect(outside.headers()['content-type'] ?? '').not.toContain(
    'application/json',
  );

  // 新增格式可以扩充公开样本，但开发接口必须完整返回公开目录且不混入本机文件。
  const catalogue = await sampleCatalog(process.cwd());
  expect(data.samples.map((sample) => sample.id).sort()).toEqual(catalogue.map((sample) => sample.id).sort());
  expect(data.samples.some((s) => s.id === 'basic-docx')).toBe(true);
  expect(JSON.stringify(data).includes('absolute')).toBe(false);
  await page.goto(server.url + base);
  await expect(
    page.getByRole('heading', { name: 'Filumo 本地烟测' }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page).toHaveURL(server.url + base + 'dev/smoke-test');
  await expect(
    page.getByRole('heading', { name: 'Word', exact: true }),
  ).toBeVisible();
  const sidebar = page.getByRole('complementary', { name: '烟测样本列表' });
  const preview = page.getByRole('region', { name: '文档预览', exact: true });
  const sideBounds = await sidebar.boundingBox();
  const previewBounds = await preview.boundingBox();
  expect(previewBounds.x).toBeGreaterThan(sideBounds.x + sideBounds.width);
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
    response.url().endsWith(base + '__filumo_smoke/files/basic-docx'),
  );
  await page
    .getByRole('button', { name: 'basic-docx (DOCX)', exact: true })
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
  await expect(
    page.getByRole('button', { name: 'basic-docx (DOCX)', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('textbox', { name: '搜索烟测样本' }).fill('pptx');
  await expect(
    page.getByRole('button', { name: 'basic-pptx (PPTX)', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'basic-docx (DOCX)', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('textbox', { name: '搜索烟测样本' }).fill('');
  await page.getByRole('button', { name: '恢复默认值', exact: true }).click();
  await expect(page.locator('.office-file-docx-viewer')).toBeVisible();
  await page.getByRole('button', { name: 'DOM 外壳', exact: true }).click();
  await expect(page.getByText('就绪：无分页能力')).toBeVisible();
  await expect(page.locator('.office-file-docx-viewer')).toHaveCount(0);
  await page.getByRole('button', { name: '文档文件', exact: true }).click();
  await expect(page.locator('.office-file-docx-viewer')).toBeVisible();
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
  await page.getByRole('button', { name: '收起事件日志' }).click();
  await expect(page.getByLabel('事件日志', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '展开事件日志' }).click();
  await page.getByRole('button', { name: '清空日志' }).click();
  await expect(page.getByLabel('事件日志')).toHaveText('');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
