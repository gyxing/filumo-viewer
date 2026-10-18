import { expect, test } from '@playwright/test';
import { startServer } from '../helpers.mjs';

let server;
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-demo.mjs', ['--framework', 'vanilla', '--port', '0']);
});
test.afterAll(async () => server?.close());

test('未知文本复用原文预览，标签保持文字且文件选择器允许未知后缀', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: '未知文本', exact: true }).click();
  await expect(page.locator('.fivo-text-surface')).toBeVisible();
  await expect(page.locator('.fivo-text-line-content').first()).toHaveText('未知后缀文本');
  await expect(page.locator('.fivo-text-line-content').nth(1))
    .toHaveText('<script>window.fivoFallbackExecuted = true</script>');
  expect(await page.evaluate(() => window.fivoFallbackExecuted)).toBeUndefined();
  await expect(page.locator('.fivo-title')).toHaveText('settings.custom');
  await expect(page.locator('.fivo-viewer input[type="file"]')).toHaveAttribute('accept', '');
});

for (const locale of ['zh-CN', 'en-US']) {
  test('未知二进制使用明确的不支持状态：' + locale, async ({ page, request }) => {
    const graph = await (await request.get(server.url + '/asset-graph.json')).json();
    const seen = new Set();
    page.on('request', (item) => seen.add(new URL(item.url()).pathname));
    await page.goto(server.url + '/text-formats.html?locale=' + locale);
    await page.getByRole('button', { name: '未知二进制', exact: true }).click();
    await expect(page.locator('.fivo-status-heading'))
      .toHaveText(locale === 'en-US' ? 'Unsupported format' : '暂不支持该格式');
    await expect(page.locator('.fivo-status')).toHaveAttribute('role', 'alert');
    await expect(page.locator('.fivo-text-surface')).toHaveCount(0);
    await expect(page.getByRole('button', { name: locale === 'en-US' ? 'Retry' : '重试', exact: true }))
      .toHaveCount(0);
    await expect(page.getByRole('button', {
      name: locale === 'en-US' ? 'Open another file' : '打开其他文件', exact: true,
    })).toBeVisible();
    const files = [...seen].flatMap((path) => graph[path] ?? []);
    expect(files.some((path) => /text\/src\/(?:runtime|view|worker)\//.test(path))).toBe(false);
    await page.getByRole('button', { name: '未知文本', exact: true }).click();
    await expect(page.locator('.fivo-text-surface')).toBeVisible();
    await expect(page.locator('.fivo-status')).toBeHidden();
  });
}

test('文本前缀后的二进制内容不会进入编码恢复页面', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: '混合文件', exact: true }).click();
  await expect(page.locator('.fivo-status-heading')).toHaveText('暂不支持该格式');
  await expect(page.locator('.fivo-text-surface')).toHaveCount(0);
  await expect(page.locator('.fivo-reading-status')).toHaveCount(0);
});

test('关闭自动兜底后保留格式选择提示，专用 JSON 错误不改成文本预览', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html?fallback=off');
  await page.getByRole('button', { name: '未知文本', exact: true }).click();
  await expect(page.locator('.fivo-status-heading')).toHaveText('暂不支持该格式');
  await expect(page.locator('.fivo-viewer input[type="file"]')).toHaveAttribute('accept', /\.txt/);
  await page.getByRole('button', { name: '文本', exact: true }).click();
  await expect(page.locator('.fivo-text-surface')).toBeVisible();
  await page.getByRole('button', { name: '无效 JSON', exact: true }).click();
  await expect(page.getByText(/JSON 语法错误/)).toBeVisible();
  await expect(page.locator('.fivo-text-surface')).toHaveCount(0);
});
