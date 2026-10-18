import { expect, test } from '@playwright/test';
import { startServer } from '../helpers.mjs';
let server;
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-demo.mjs', [
    '--framework', 'vanilla', '--port', '0',
  ]);
});
test.afterAll(async () => server?.close());

async function openHtml(page) {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown HTML', exact: true }).click();
  await expect(page.locator('.fivo-markdown-article')).toBeVisible();
  return page.locator('.fivo-markdown-article');
}

test('HTML 换行、成对链接和 Markdown 行内格式保持同一结构', async ({ page }) => {
  const article = await openHtml(page);
  await expect(article.locator('p').filter({ hasText: '第一行' }).first().locator('br'))
    .toHaveCount(3);
  const link = article.getByRole('link', { name: '链接中的 加粗文字', exact: true });
  await expect(link).toHaveAttribute('href', 'https://example.com/?a=1&b=2');
  await expect(link.locator('strong')).toHaveText('加粗文字');
  await expect(article).toContainText('，外面的文字。');
  const styled = article.getByText('居中格式文字', { exact: true });
  expect(await styled.evaluate((element) => getComputedStyle(element).position)).toBe('static');
  expect(await styled.evaluate((element) => getComputedStyle(element.parentElement).textAlign)).toBe('center');
  await expect(article.locator('center,font,strike')).toHaveCount(0);
  await expect(article.locator('del')).toHaveText('旧式排版');
  const size = article.getByText('定号文字', { exact: true });
  expect(await size.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(14, 1);
  const zoom = page.getByRole('spinbutton', { name: '缩放比例', exact: true });
  await zoom.fill('150');
  await zoom.press('Enter');
  await expect.poll(() => size.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)))
    .toBeCloseTo(21, 1);
});

test('HTML 表格保留合并、列宽和内部内容，宽表只在正文中滚动', async ({ page }) => {
  const article = await openHtml(page),
    table = article.locator('table').filter({ has: page.locator('caption') });
  await expect(table.locator('caption')).toHaveText('原生合并表格');
  await expect(table.locator('td[rowspan="2"]')).toHaveText('合并行');
  await expect(table.locator('tbody td[colspan="2"]')).toHaveText('合并列');
  await expect(table.locator('tfoot')).toContainText('表尾');
  await expect(table.locator('td').filter({ hasText: '第一项' }).locator('br')).toHaveCount(1);
  await expect(table.getByRole('link', { name: '单元格链接', exact: true }))
    .toHaveAttribute('href', 'https://example.com/');
  expect(await table.evaluate((element) => element.parentElement.className))
    .toBe('fivo-markdown-table');
  expect(await table.evaluate((element) => element.parentElement.scrollWidth > element.parentElement.clientWidth))
    .toBe(true);
});

test('HTML 标题接入大纲，自定义锚点展开 details 并仅定位正文', async ({ page }) => {
  const article = await openHtml(page),
    details = article.locator('details'),
    outline = page.locator('.fivo-markdown-outline');
  await expect(details).not.toHaveAttribute('open');
  await expect(outline.getByRole('treeitem', { name: 'HTML 标题 强调', exact: true })).toBeVisible();
  await expect(outline.getByRole('treeitem')).toHaveCount(2);
  const jump = article.getByRole('link', { name: '跳转折叠标题', exact: true });
  await expect(jump).toHaveAttribute('href', /#fivo-md-\d+-native-target$/);
  const before = await page.locator('.fivo-reading-frame').evaluate((element) => element.scrollTop);
  await jump.click();
  await expect(details).toHaveAttribute('open', '');
  expect(await page.locator('.fivo-reading-frame').evaluate((element) => element.scrollTop)).toBe(before);
  await expect(outline.getByRole('treeitem', { name: 'HTML 标题 强调', exact: true }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(article.locator('a[name]')).toHaveCount(0);
  await expect(article.getByRole('link', { name: '旧式锚点', exact: true }))
    .toHaveAttribute('href', /#fivo-md-\d+-legacy-anchor$/);
  await details.locator('summary').click();
  await expect(details).not.toHaveAttribute('open');
  const more = page.locator('.fivo-toolbar-more');
  await more.locator('.fivo-toolbar-more-trigger').click();
  await page.getByRole('menu', { name: '更多操作', exact: true })
    .getByRole('menuitem', { name: '查找', exact: true }).click();
  await page.locator('.fivo-markdown-find input').fill('折叠区域正文');
  await expect(details).toHaveAttribute('open', '');
});

test('HTML 资源走受控路径，代码保留原文，不执行脚本或文档样式', async ({ page }) => {
  const external = [];
  await page.route('https://invalid.example/**', async (route) => {
    external.push(route.request().url());
    await route.abort();
  });
  const article = await openHtml(page);
  await expect(article.locator('script,style,iframe,[onerror],[onclick]')).toHaveCount(0);
  expect(await page.evaluate(() => window.htmlUnsafe)).toBeUndefined();
  expect(external).toEqual([]);
  const image = article.locator('img[alt="HTML图片"]');
  await image.locator('..').scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  const size = await image.boundingBox();
  expect(size.width).toBeCloseTo(400, 0);
  expect(size.height).toBeCloseTo(200, 0);
  await expect(article.locator('figcaption')).toHaveText('原生图注');
  await expect(article.locator('input[type="checkbox"]')).toBeDisabled();
  expect(await article.locator('pre code').allTextContents()).toContain('const tag = "<div>";');
  expect(await article.locator('pre code').allTextContents())
    .toContain('<table><tr><td>代码中的表格</td></tr></table>');
  await expect(article).toContainText('未知容器保留内部正文');
});

test('没有真实 HTML 的 Markdown 不加载 HTML 渲染模块', async ({ page, request }) => {
  const graph = await (await request.get(server.url + '/asset-graph.json')).json();
  const loaded = new Set();
  page.on('request', (request) => loaded.add(new URL(request.url()).pathname));
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown 纯文档', exact: true }).click();
  await expect(page.locator('.fivo-markdown-reading')).toBeVisible();
  const inputs = [...loaded].flatMap((path) => graph[path] ?? []);
  expect(inputs.some((path) => /HtmlFragment|htmlPolicy|htmlNavigation/.test(path))).toBe(false);
});
