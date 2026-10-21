import { expect, test } from '@playwright/test';
import { startServer } from '../helpers.mjs';
let server;
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-word-check.mjs');
});
test.afterAll(async () => server?.close());

test('子级竖线从父节点横线末端垂下，叶子横线保持文字间距', async ({ page }) => {
  await page.goto(server.url + '/outline.html?complete=1');
  const tree = page.getByRole('tree');
  const a = tree.locator('[data-outline-id="a"]'),
    b = tree.locator('[data-outline-id="b"]');
  const parent = await a.evaluate((row) => {
    const branch = row.querySelector('.filumo-outline-branch'),
      line = branch.getBoundingClientRect();
    const connector = row
      .querySelector('.filumo-outline-child-connector')
      .getBoundingClientRect();
    return {
      end: line.left + parseFloat(getComputedStyle(branch, '::after').width),
      y: line.top + parseFloat(getComputedStyle(branch, '::after').top),
      x: connector.left,
      top: connector.top,
      bottom: connector.bottom,
    };
  });
  const child = await b.evaluate((row) => {
    const branch = row.querySelector('.filumo-outline-branch'),
      icon = row
        .querySelector('.filumo-outline-switcher > span')
        .getBoundingClientRect();
    return {
      x: branch.getBoundingClientRect().left,
      top:
        branch.getBoundingClientRect().top +
        parseFloat(getComputedStyle(branch, '::before').top),
      icon: icon.left + icon.width / 2,
    };
  });
  expect(Math.abs(parent.end - parent.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(parent.y - parent.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(parent.x - child.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(parent.bottom - child.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(parent.x - child.icon)).toBeLessThanOrEqual(1);
  const leaf = tree.locator('[data-outline-id="c"]');
  const leafGap = await leaf.evaluate((row) => {
    const branch = row.querySelector('.filumo-outline-branch');
    const label = row.querySelector('.filumo-outline-label');
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
      .locator('.filumo-outline-child-connector')
      .evaluate((el) => getComputedStyle(el).height),
  ).toBe('14px');
  expect(
    await leaf
      .locator('.filumo-outline-branch')
      .evaluate((el) => getComputedStyle(el, '::before').height),
  ).toBe('14px');
  await expect(leaf.locator('.filumo-outline-child-connector')).toHaveCount(0);
  await page
    .locator('.filumo-native-word-outline')
    .screenshot({ path: 'tmp/outline-refined-light.png' });
  await page.locator('#preview').evaluate((el) => {
    el.dataset.officeTheme = 'dark';
  });
  await page
    .locator('.filumo-native-word-outline')
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

test('一级目录都有树线，首尾收口且不增加标题缩进', async ({ page }) => {
  await page.goto(server.url + '/outline.html?complete=1');
  const tree = page.getByRole('tree'),
    first = tree.locator('[data-outline-id="a"]');
  const firstBranch = first.locator('.filumo-outline-branch');
  await expect(firstBranch).toHaveAttribute('data-root', 'true');
  await expect(firstBranch).toHaveAttribute('data-first', 'true');
  expect(
    await firstBranch.evaluate(
      (node) => getComputedStyle(node, '::before').top,
    ),
  ).toBe('14px');
  expect(
    await firstBranch.evaluate(
      (node) => getComputedStyle(node, '::before').height,
    ),
  ).toBe('14px');
  await first.press('End');
  const last = tree.locator('[data-outline-id="n99"]'),
    branch = last.locator('.filumo-outline-branch');
  await expect(branch).toHaveAttribute('data-root', 'true');
  await expect(branch).toHaveAttribute('data-continues', 'false');
  await expect(last).toHaveCSS('padding-left', '0px');
  await expect(last.locator('.filumo-outline-switcher')).toHaveCount(0);
  const geometry = await last.evaluate((row) => {
    const line = row.querySelector('.filumo-outline-branch'),
      label = row.querySelector('.filumo-outline-label');
    return {
      top: getComputedStyle(line, '::before').top,
      height: getComputedStyle(line, '::before').height,
      gap:
        label.getBoundingClientRect().left +
        parseFloat(getComputedStyle(label).paddingLeft) -
        line.getBoundingClientRect().left -
        parseFloat(getComputedStyle(line, '::after').width),
    };
  });
  expect(geometry).toEqual({ top: '0px', height: '14px', gap: 4 });
  await expect(
    tree.getByRole('treeitem').first().locator('.filumo-outline-branch'),
  ).toHaveAttribute('data-first', 'false');
});

test('一级和子级图标均位于本级竖线上，折叠恢复不改变对齐', async ({ page }) => {
  await page.goto(server.url + '/outline.html?complete=1');
  const tree = page.getByRole('tree');
  const assertAligned = async (id) => {
    const row = tree.locator('[data-outline-id="' + id + '"]');
    const geometry = await row.evaluate((node) => {
      const line = node.querySelector('.filumo-outline-branch'),
        icon = node
          .querySelector('.filumo-outline-switcher > span')
          .getBoundingClientRect();
      const axis =
        line.getBoundingClientRect().left +
        parseFloat(getComputedStyle(line, '::before').width) / 2;
      return {
        difference: Math.abs(icon.left + icon.width / 2 - axis),
        padding: getComputedStyle(node).paddingLeft,
      };
    });
    expect(geometry.difference).toBeLessThanOrEqual(1);
    expect(geometry.padding).toBe(id === 'a' ? '0px' : '16px');
  };
  await assertAligned('a');
  await assertAligned('b');
  const root = tree.locator('[data-outline-id="a"]');
  await root.press('ArrowLeft');
  await expect(tree.locator('[data-outline-id="b"]')).toHaveCount(0);
  await assertAligned('a');
  await root.press('ArrowRight');
  await assertAligned('b');
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
  await expect(b.locator('.filumo-outline-branch')).toHaveAttribute(
    'data-continues',
    'true',
  );
  expect(
    await b
      .locator('.filumo-outline-branch')
      .evaluate((el) => getComputedStyle(el, '::after').width),
  ).toBe('16px');
  expect(
    await a
      .locator('.filumo-outline-switcher > span')
      .evaluate((el) => getComputedStyle(el).borderTopWidth),
  ).toBe('1px');
  await a.press('ArrowRight');
  await expect(b).toBeFocused();
  await b.press('ArrowRight');
  const c = tree.locator('[data-outline-id="c"]');
  await expect(c).toHaveAttribute('aria-level', '3');
  await expect(c.locator('.filumo-outline-guide')).toHaveCount(2);
  await expect(
    tree.locator('[data-outline-id="d"] .filumo-outline-branch'),
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
  await expect(a.locator('.filumo-outline-label')).toHaveCSS('font-size', '14px');
  await expect(
    page.getByRole('button', { name: '收起大纲', exact: true }),
  ).toBeVisible();
  await page
    .locator('.filumo-native-word-outline')
    .screenshot({ path: 'tmp/outline-restored.png' });
  await info.attach('outline-restored', {
    body: await page.locator('.filumo-native-word-outline').screenshot(),
    contentType: 'image/png',
  });
  await page.locator('#preview').evaluate((el) => {
    el.dataset.officeTheme = 'dark';
  });
  await expect(a).toHaveAttribute('aria-level', '1');
  await page
    .locator('.filumo-native-word-outline')
    .screenshot({ path: 'tmp/outline-restored-dark.png' });
  await page.getByRole('button', { name: '销毁大纲', exact: true }).click();
  await expect(tree).toHaveCount(0);
});
