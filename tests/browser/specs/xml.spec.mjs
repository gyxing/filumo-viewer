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

test('XML 结构值着色、选中保色和主题切换保留节点语义与定位', async ({
  page,
}) => {
  await page.goto(server.url + '/text-expansion.html');
  await page.getByRole('button', { name: 'xml-colored', exact: true }).click();
  const tree = page.locator('.filumo-xml-pane-tree').getByRole('tree');
  const row = tree.getByRole('treeitem', {
    name: '@enabled = "true"',
    exact: true,
  });
  const value = row.locator('.filumo-xml-node-value'),
    name = row.locator('.filumo-xml-node-name');
  await expect(value).toHaveText('true');
  const colors = await Promise.all(
    [value, name].map((part) =>
      part.evaluate((node) => getComputedStyle(node).color),
    ),
  );
  expect(colors[0]).not.toBe(colors[1]);
  await value.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(value).toHaveCSS('color', colors[0]);
  await expect
    .poll(async () =>
      (await page.locator('.filumo-text-reveal').allTextContents()).join(''),
    )
    .toContain('enabled="true"');
  await expect(
    tree
      .getByRole('treeitem', { name: '@id = "001"', exact: true })
      .locator('.filumo-xml-node-value'),
  ).toHaveText('001');
  await expect(
    tree
      .getByRole('treeitem', { name: '@note = "<b>文本</b>"', exact: true })
      .locator('.filumo-xml-node-value'),
  ).toHaveText('<b>文本</b>');
  await expect(tree.locator('b,script')).toHaveCount(0);
  await expect(
    tree
      .getByRole('treeitem', { name: '<![CDATA[<原始内容>]]>', exact: true })
      .locator('.filumo-xml-node-value'),
  ).toHaveText('<原始内容>');
  await expect(
    tree
      .getByRole('treeitem', { name: /#text: 长文本/ })
      .locator('.filumo-xml-node-value'),
  ).toContainText('…');
  await page.evaluate(() => window.filumoTextExpansion.update({ theme: 'dark' }));
  await expect(value).not.toHaveCSS('color', colors[0]);
  const dark = await value.evaluate((node) => getComputedStyle(node).color);
  await value.click();
  await expect(value).toHaveCSS('color', dark);
  await expect(row).toHaveAttribute('aria-selected', 'true');
});
test('XML 行号菜单带图标，开关状态在缩放及视图切换后保留', async ({ page }) => {
  await page.goto(server.url + '/text-expansion.html');
  await page.getByRole('button', { name: 'xml-namespaces', exact: true }).click();
  const source = page.locator('.filumo-xml-pane-source');
  await expect(source.locator('.filumo-text-line-number').first()).toBeVisible();
  await page.locator('.filumo-toolbar-more-trigger').click();
  const lines = page.getByRole('menuitemcheckbox', { name: '行号', exact: true });
  await expect(lines.locator('svg[data-name="lines"]')).toBeVisible();
  await expect(lines).toHaveAttribute('aria-checked', 'true');
  await lines.click();
  await expect(lines).toHaveAttribute('aria-checked', 'false');
  await expect(source.locator('.filumo-text-line-number:visible')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.filumoTextExpansion.update({ zoom: 150 }));
  await page.locator('.filumo-toolbar-more-trigger').click();
  await expect(lines).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('menuitem', { name: '视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '原文', exact: true }).click();
  await expect(source.locator('.filumo-text-line-number:visible')).toHaveCount(0);
  await page.locator('.filumo-toolbar-more-trigger').click();
  await lines.click();
  await expect(lines).toHaveAttribute('aria-checked', 'true');
  await expect(source.locator('.filumo-text-line-number').first()).toBeVisible();
  await page.getByRole('menuitem', { name: '视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '双栏', exact: true }).click();
  await expect(page.locator('.filumo-xml-pane-tree')).toBeVisible();
  await expect(source.locator('.filumo-text-line-number').first()).toBeVisible();
});

test('XML 初始双栏与拖动比例恢复保持源文定位', async ({ page }) => {
  await page.goto(server.url + '/text-expansion.html');
  await page
    .getByRole('button', { name: 'xml-namespaces', exact: true })
    .click();
  const first = page.locator('.filumo-xml-pane-source'),
    second = page.locator('.filumo-xml-pane-tree');
  await expect(second.getByRole('tree')).toBeVisible();
  await expect(first.locator('.filumo-text-line-number').first()).toBeVisible();
  await expect(first.locator('.filumo-text-filler-number')).toHaveCount(0);
  const a = await first.boundingBox(),
    b = await second.boundingBox();
  expect(Math.abs(a.width - b.width)).toBeLessThan(10);
  const handle = page.getByRole('separator'),
    bounds = await handle.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 130, bounds.y + 30);
  await page.mouse.up();
  const resized = (await first.boundingBox()).width;
  expect(Math.abs(resized - a.width)).toBeGreaterThan(50);
  await page
    .getByRole('treeitem')
    .filter({ hasText: 'p:item' })
    .first()
    .click();
  await expect(first.locator('.filumo-text-row').filter({ has: page.locator('.filumo-text-reveal') })).toContainText('p:item');
  await page.evaluate(() => {
    window.filumoTextExpansion.setActive(false);
    window.filumoTextExpansion.setActive(true);
  });
  await expect
    .poll(async () => (await first.boundingBox()).width)
    .toBeCloseTo(resized, 0);
  await expect(first.locator('.filumo-text-line-number').first()).toBeVisible();
});
