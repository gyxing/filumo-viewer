import { expect, test } from '@playwright/test';
import { normalizeDocsBase } from '../../../apps/docs/config/base-path.js';
import { startServer } from '../helpers.mjs';
const base = normalizeDocsBase(process.env.FILUMO_DOCS_BASE);
let server;
test.beforeAll(
  async () => (server = await startServer('scripts/testing/serve-smoke.mjs')),
);
test.afterAll(async () => server?.close());
test('本机烟测保留全部样本及 WPS 预览', async ({ page, request }) => {
  const data = await (
    await request.get(server.url + base + '__filumo_smoke/samples')
  ).json();
  expect(data.samples.some((s) => s.id === 'wps')).toBe(true);
  expect(data.samples.length).toBeGreaterThanOrEqual(36);
  const bytes = await (
    await request.get(server.url + base + '__filumo_smoke/files/wps')
  ).body();
  await page.goto(server.url + base + 'dev/smoke-test');
  await page.getByLabel('选择本机文件').setInputFiles({
    name: 'sample.wps',
    mimeType: 'application/wps-office.wps',
    buffer: bytes,
  });
  await expect(page.locator('.office-file-doc-viewer')).toBeVisible({
    timeout: 60000,
  });
});
