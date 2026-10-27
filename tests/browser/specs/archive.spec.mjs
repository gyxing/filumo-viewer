import { expect, test } from '@playwright/test';
import { zipFixture } from '../../fixtures/public/archive/samples.mjs';
import { isolateNetwork, startServer } from '../helpers.mjs';
let server;
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-consumers.mjs');
});
test.afterAll(async () => {
  await server?.close();
});
test('安装后的 ZIP 目录、子文本预览与返回保留导航', async ({ page }) => {
  await isolateNetwork(page);
  await page.goto(server.url + '/vanilla/');
  await page.locator('#file').setInputFiles({
    name: 'sample.zip',
    mimeType: 'application/zip',
    buffer: zipFixture(),
  });
  await expect(
    page.locator('.filumo-archive-row').filter({ hasText: 'docs' }),
  ).toBeVisible();
  await page.locator('.filumo-archive-row').filter({ hasText: 'docs' }).click();
  await page
    .locator('.filumo-archive-row')
    .filter({ hasText: 'readme.txt' })
    .click();
  await expect(page.locator('.filumo-archive-preview')).toContainText(
    'Hello Filumo',
  );
  await expect(page.locator('.filumo-toolbar:visible')).toHaveCount(1);
  await page.locator('.filumo-archive-back').click();
  await expect(
    page.locator('.filumo-archive-row').filter({ hasText: 'readme.txt' }),
  ).toBeVisible();
});
test('HTML 默认源码，阅读不执行脚本，切换不改变来源', async ({ page }) => {
  await isolateNetwork(page);
  await page.goto(server.url + '/vanilla/');
  await page.locator('#file').setInputFiles({
    name: 'sample.html',
    mimeType: 'text/html',
    buffer: Buffer.from(
      '<h1>HTML example</h1><script>window.archiveHtmlExecuted=true</script><p>Safe text</p>',
    ),
  });
  const toggle = page.locator('[data-filumo-action="code.view"]');
  await expect(toggle).toContainText('阅读');
  await toggle.click();
  await expect(page.locator('.filumo-html-article')).toContainText('Safe text');
  expect(await page.evaluate(() => window.archiveHtmlExecuted)).toBeUndefined();
  await toggle.click();
  await expect(toggle).toContainText('阅读');
});
test('嵌套 SQL 预览仅有一套工具栏，正文撑满容器，下载目标正确', async ({
  page,
}) => {
  await isolateNetwork(page);
  await page.goto(server.url + '/vanilla/');
  await page
    .locator('#file')
    .setInputFiles({
      name: 'outer.zip',
      mimeType: 'application/zip',
      buffer: zipFixture({
        'inner.zip': zipFixture({ 'example.sql': 'SELECT 1 AS value;' }),
      }),
    });
  await page.getByRole('option', { name: /^inner\.zip / }).click();
  await page.getByRole('option', { name: /^example\.sql / }).click();
  await expect(page.getByLabel('文本内容', { exact: true })).toContainText(
    'SELECT 1 AS value;',
  );
  await expect(page.locator('.filumo-toolbar:visible')).toHaveCount(1);
  expect(
    await page
      .getByLabel('文本内容', { exact: true })
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThan(200);
  await page.getByRole('button', { name: '查找', exact: true }).click();
  await page
    .getByRole('searchbox', { name: '查找文本', exact: true })
    .fill('SELECT');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '下载', exact: true }).locator('svg'),
  ).toHaveCount(2);
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: '下载当前文件', exact: true })
    .click();
  expect((await pending).suggestedFilename()).toBe('example.sql');
  await page.locator('.filumo-archive-back').click();
  await expect(
    page.getByRole('option', { name: /^example\.sql / }),
  ).toBeVisible();
  await page.locator('.filumo-archive-back').click();
  await expect(
    page.getByRole('option', { name: /^inner\.zip / }),
  ).toBeVisible();
});
