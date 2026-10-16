import { expect, test } from '@playwright/test';
import { startServer } from '../helpers.mjs';
let server;
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-word-check.mjs');
});
test.afterAll(async () => server?.close());

test('树线衔接展开方框，叶子横线接近标题且末分支收尾', async ({ page }) => {
  await page.goto(server.url + '/outline.html?complete=1');
  const tree = page.getByRole('tree');
  const b = tree.locator('[data-outline-id="b"]');
  const parentEnd = await b.evaluate((row) => {
    const branch = row.querySelector('.fivo-outline-branch');
    const end =
      branch.getBoundingClientRect().left +
      parseFloat(getComputedStyle(branch, '::after').width);
    return Math.abs(
      end -
        row
          .querySelector('.fivo-outline-switcher > span')
          .getBoundingClientRect().left,
    );
  });
  expect(parentEnd).toBeLessThanOrEqual(1);
  const leaf = tree.locator('[data-outline-id="c"]');
  const leafGap = await leaf.evaluate((row) => {
    const branch = row.querySelector('.fivo-outline-branch');
    const label = row.querySelector('.fivo-native-outline-label');
    return (
      label.getBoundingClientRect().left +
      parseFloat(getComputedStyle(label).paddingLeft) -
      branch.getBoundingClientRect().left -
      parseFloat(getComputedStyle(branch, '::after').width)
    );
  });
  expect(leafGap).toBe(4);
  expect(
    await b
      .locator('.fivo-outline-switcher')
      .evaluate((el) => getComputedStyle(el, '::after').height),
  ).toBe('8px');
  expect(
    await leaf
      .locator('.fivo-outline-branch')
      .evaluate((el) => getComputedStyle(el, '::before').height),
  ).toBe('14px');
  await page
    .locator('.fivo-native-word-outline')
    .screenshot({ path: 'tmp/outline-refined-light.png' });
  await page.locator('#preview').evaluate((el) => {
    el.dataset.officeTheme = 'dark';
  });
  await page
    .locator('.fivo-native-word-outline')
    .screenshot({ path: 'tmp/outline-refined-dark.png' });
});

test('完整小树默认展开全部层级，收起后刷新不强制重开', async ({ page }) => {
  await page.goto(server.url + '/outline.html?complete=1');
  const tree = page.getByRole('tree');
  const a = tree.locator('[data-outline-id="a"]');
  const b = tree.locator('[data-outline-id="b"]');
  await expect(b).toHaveAttribute('aria-expanded', 'true');
  await expect(tree.locator('[data-outline-id="c"]')).toBeVisible();
  await b.press('ArrowLeft');
  await expect(tree.locator('[data-outline-id="c"]')).toHaveCount(0);
  await b.press('ArrowLeft');
  await expect(a).toBeFocused();
  await page.getByRole('button', { name: '追加子级', exact: true }).click();
  await expect(b).toHaveAttribute('aria-expanded', 'false');
});

test('原生大纲恢复树线、紧凑间距、键盘、滚动同步和渐进更新', async ({
  page,
}, info) => {
  await page.goto(server.url + '/outline.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const tree = page.getByRole('tree');
  const a = tree.locator('[data-outline-id="a"]');
  const b = tree.locator('[data-outline-id="b"]');
  await expect(a).toHaveAttribute('aria-expanded', 'true');
  await expect(b).toHaveAttribute('aria-level', '2');
  expect(await a.evaluate((el) => el.getBoundingClientRect().height)).toBe(28);
  expect(
    await b.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)),
  ).toBe(16);
  await expect(b.locator('.fivo-outline-branch')).toHaveAttribute(
    'data-continues',
    'true',
  );
  expect(
    await b
      .locator('.fivo-outline-branch')
      .evaluate((el) => getComputedStyle(el, '::after').width),
  ).toBe('10px');
  expect(
    await a
      .locator('.fivo-outline-switcher > span')
      .evaluate((el) => getComputedStyle(el).borderTopWidth),
  ).toBe('1px');
  await a.press('ArrowRight');
  await expect(b).toBeFocused();
  await b.press('ArrowRight');
  const c = tree.locator('[data-outline-id="c"]');
  await expect(c).toHaveAttribute('aria-level', '3');
  await expect(c.locator('.fivo-outline-guide')).toHaveCount(1);
  await expect(
    tree.locator('[data-outline-id="d"] .fivo-outline-branch'),
  ).toHaveAttribute('data-continues', 'false');
  await b.press('ArrowRight');
  await expect(c).toBeFocused();
  await c.press('Enter');
  await expect(c).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#result')).toHaveText('定位：c');
  await page.locator('#body-scroll').evaluate((el) => {
    el.scrollTop = 660;
  });
  await expect(tree.locator('[data-outline-id="d"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await a.getByRole('button', { name: '收起 一、背景', exact: true }).click();
  await expect(b).toHaveCount(0);
  await a.getByRole('button', { name: '展开 一、背景', exact: true }).click();
  await expect(b).toBeVisible();
  await a.press('End');
  await expect(tree.locator('[data-outline-id="n99"]')).toBeFocused();
  expect(await tree.getByRole('treeitem').count()).toBeLessThan(40);
  await page.getByRole('button', { name: '追加子级', exact: true }).click();
  const last = tree.locator('[data-outline-id="n99"]');
  await last.getByRole('button', { name: '展开 章节 99', exact: true }).click();
  await expect(tree.locator('[data-outline-id="late"]')).toBeVisible();
  await last.press('Home');
  await expect(a).toBeFocused();
  await expect(a.locator('.fivo-native-outline-label')).toHaveCSS(
    'font-size',
    '14px',
  );
  await expect(
    page.getByRole('button', { name: '收起大纲', exact: true }),
  ).toBeVisible();
  await page
    .locator('.fivo-native-word-outline')
    .screenshot({ path: 'tmp/outline-restored.png' });
  await info.attach('outline-restored', {
    body: await page.locator('.fivo-native-word-outline').screenshot(),
    contentType: 'image/png',
  });
  await page.locator('#preview').evaluate((el) => {
    el.dataset.officeTheme = 'dark';
  });
  await expect(a).toHaveAttribute('aria-level', '1');
  await page
    .locator('.fivo-native-word-outline')
    .screenshot({ path: 'tmp/outline-restored-dark.png' });
  await page.getByRole('button', { name: '销毁大纲', exact: true }).click();
  await expect(tree).toHaveCount(0);
});
