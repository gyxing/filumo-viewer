import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isolateNetwork, runChecks, startServer } from '../helpers.mjs';

let consumers;
test.beforeAll(async () => {
  consumers = await startServer('scripts/testing/serve-consumers.mjs');
});
test.afterAll(async () => {
  await consumers?.close();
});
for (const id of [
  'vanilla',
  'react18',
  'react19',
  'react-strict',
  'vue3',
  'vue26',
  'vue27',
]) {
  test(id + ' 打包消费、切换、生命周期与自动样式', async ({ page }, info) => {
    await runChecks(
      page,
      consumers.url + '/' + id + '/',
      info,
      '#verify',
      '#checks',
    );
  });
}
test('严格 CSP、跨 Document 与非 Office 能力', async ({ page }, info) => {
  await runChecks(page, consumers.url + '/vanilla/checks.html', info);
});
for (const [label, script] of [
  ['共享原生资源服务', 'serve-services.mjs'],
  ['演示文稿元素对照', 'serve-presentation-check.mjs'],
  ['Word 长表格分页对照', 'serve-word-check.mjs'],
  ['稀疏表格窗口', 'serve-spreadsheet-check.mjs'],
]) {
  test(label, async ({ page }, info) => {
    const server = await startServer('scripts/testing/' + script);
    try {
      await runChecks(page, server.url, info);
    } finally {
      await server.close();
    }
  });
}
test('原件下载实际落盘字节一致', async ({ page }, info) => {
  await isolateNetwork(page);
  await page.goto(consumers.url + '/vanilla/');
  await page.locator('#docx').click();
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: /下载/ }).click();
  const download = await wait;
  const file = await download.path();
  expect(file).not.toBeNull();
  const actual = await readFile(file);
  // 对比该消费者实际加载的源文件，不能拿其他服务重生成的 ZIP 当作下载原件。
  const expected = await (
    await page.request.get(consumers.url + '/vanilla/fixtures/sample.docx')
  ).body();
  expect(actual.equals(expected)).toBe(true);
  await info.attach('download-sha256', {
    body: createHash('sha256').update(actual).digest('hex'),
    contentType: 'text/plain',
  });
});

test('描述符保持轻量，按真实产物映射加载格式与 Worker', async ({
  page,
  request,
}, info) => {
  const id = 'vanilla',
    base = consumers.url + '/' + id + '/';
  const metadata = await (
    await request.get(base + 'fivo-consumer.json')
  ).json();
  const requested = new Set(),
    workers = [];
  await isolateNetwork(page);
  page.on('request', (r) => requested.add(new URL(r.url()).pathname));
  page.on('worker', (worker) => workers.push(new URL(worker.url()).pathname));
  await page.goto(base);
  await expect(page.locator('#verify')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const route = (file) => new URL(file, base).pathname;
  for (const file of Object.values(metadata.graph.lazyRoleOutputs).flat())
    expect(requested.has(route(file))).toBe(false);
  expect(workers.length).toBe(0);
  for (const [format, role] of [
    ['docx', 'word'],
    ['xlsx', 'spreadsheet'],
    ['pptx', 'presentation'],
  ]) {
    await page.locator('#' + format).click();
    await expect(
      page.locator(
        '[data-office-renderer="' +
          (role === 'word'
            ? 'word-dom'
            : role === 'spreadsheet'
            ? 'spreadsheet-dom'
            : 'presentation-dom') +
          '"]',
      ),
    ).toBeVisible();
    await expect
      .poll(() =>
        metadata.graph.lazyRoleOutputs[role].every((file) =>
          requested.has(route(file)),
        ),
      )
      .toBe(true);
  }
  for (const role of ['driver', 'selector'])
    expect(
      metadata.graph.lazyRoleOutputs[role].every((file) =>
        requested.has(route(file)),
      ),
    ).toBe(true);
  expect(workers.length).toBeGreaterThan(0);
  expect(
    workers.every((url) => metadata.worker.some((file) => url === route(file))),
  ).toBe(true);
  await info.attach('actual-resource-requests', {
    body: JSON.stringify({ requested: [...requested], workers }),
    contentType: 'application/json',
  });
});
