import { expect, test } from '@playwright/test';
import { startServer } from '../helpers.mjs';
let server;
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-format-check.mjs');
});
test.afterAll(async () => server?.close());
async function fixture(page, query = '') {
  await page.goto(server.url + '/toolbar.html' + query);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
}
const state = (page) =>
  page.locator('#result').evaluate((el) => JSON.parse(el.textContent));

test('更多位于所有工具栏操作之后，视觉位置与键盘顺序一致', async ({ page }) => {
  await fixture(page, '?width=320');
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  const toolbar = page.getByRole('toolbar');
  const more = toolbar.getByRole('button', { name: '更多操作', exact: true });
  await expect(more).toBeVisible();
  expect(await toolbar.evaluate((element) =>
    element.lastElementChild.classList.contains('fivo-toolbar-more'))).toBe(true);
  const bounds = await more.boundingBox();
  const fullscreen = toolbar.getByRole('button', { name: '全屏', exact: true });
  const previous = await fullscreen.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(previous.x + previous.width);
  await more.focus();
  await more.press('Shift+Tab');
  await expect(fullscreen).toBeFocused();
  await fullscreen.press('Tab');
  await expect(more).toBeFocused();
  await more.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  expect(await toolbar.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);
});

test('更多使用纯菜单和单选子菜单，刷新后保留展开状态', async ({ page }) => {
  await fixture(page, '?width=320');
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  const more = page.getByRole('button', { name: '更多操作', exact: true });
  await more.click();
  const menu = page.getByRole('menu', { name: '更多操作', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.locator('input, select, [role="combobox"], [role="switch"]')).toHaveCount(0);
  const view = menu.getByRole('menuitem', { name: '表格视图', exact: true });
  await expect(view).toContainText('原始布局');
  await view.click();
  const submenu = page.getByRole('menu', { name: '表格视图', exact: true });
  await expect(submenu.getByRole('menuitemradio', { name: '原始布局', exact: true }))
    .toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '异步刷新', exact: true }).dispatchEvent('click');
  await expect(submenu).toBeVisible();
  const bounds = await submenu.boundingBox();
  const root = await page.locator('.fivo-viewer').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(root.x);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(root.x + root.width);
  await submenu.getByRole('menuitemradio', { name: '阅读模式', exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  expect((await state(page)).sheetMode).toBe('reading');
  await more.click();
  await expect(view).toContainText('阅读模式');
});

test('更多支持勾选、子菜单键盘返回及销毁清理', async ({ page }) => {
  await fixture(page, '?width=320');
  await page.getByRole('button', { name: '内容', exact: true }).click();
  const more = page.getByRole('button', { name: '更多操作', exact: true });
  await more.focus();
  await more.press('ArrowDown');
  const menu = page.getByRole('menu', { name: '更多操作', exact: true });
  const outline = menu.getByRole('menuitemcheckbox', { name: '大纲', exact: true });
  await outline.click();
  await expect(menu).toBeVisible();
  await expect(outline).toHaveAttribute('aria-checked', 'true');
  await outline.click();
  await expect(outline).toHaveAttribute('aria-checked', 'false');
  const zoom = menu.getByRole('menuitem', { name: '缩放', exact: true });
  await zoom.focus();
  await zoom.press('ArrowRight');
  const submenu = page.getByRole('menu', { name: '缩放', exact: true });
  await expect(submenu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(submenu).toHaveCount(0);
  await expect(zoom).toBeFocused();
  await zoom.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole('button', { name: '销毁工具栏', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('窄屏翻页转换为菜单并保留边界禁用状态', async ({ page }) => {
  await fixture(page, '?width=320');
  await page.getByRole('button', { name: 'PPT', exact: true }).click();
  const more = page.getByRole('button', { name: '更多操作', exact: true });
  await more.click();
  await page.getByRole('menuitem', { name: '翻页', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '上一张幻灯片', exact: true })).toBeDisabled();
  await page.getByRole('menuitem', { name: '下一张幻灯片', exact: true }).click();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  expect((await state(page)).activeIndex).toBe(1);
  await more.click();
  await page.getByRole('menuitem', { name: '翻页', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '下一张幻灯片', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: '上一张幻灯片', exact: true })).toBeEnabled();
});

for (const theme of ['light', 'dark']) {
  test('工具栏聚焦使用单层细边框：' + theme, async ({ page }) => {
    await fixture(page, '?theme=' + theme);
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    const bar = page.getByRole('toolbar');
    const select = bar.getByRole('combobox', { name: '表格视图', exact: true });
    const normalBorder = await select.evaluate(
      (el) => getComputedStyle(el).borderColor,
    );
    await select.click();
    await page.keyboard.press('Escape');
    expect(
      await select.evaluate((el) => getComputedStyle(el).outlineWidth),
    ).toBe('0px');
    await bar.getByRole('button', { name: '打开文件', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(select).toBeFocused();
    expect(await select.evaluate((el) => el.matches(':focus-visible'))).toBe(
      true,
    );
    await expect(select).toHaveCSS('border-top-width', '1px');
    expect(
      await select.evaluate((el) => getComputedStyle(el).borderColor),
    ).not.toBe(normalBorder);
    await bar.screenshot({
      path: 'tmp/toolbar-select-focus-' + theme + '.png',
    });
    await select.click();
    await page.getByRole('option', { name: '阅读模式', exact: true }).click();
    expect((await state(page)).sheetMode).toBe('reading');
    const zoom = bar.getByRole('combobox', { name: '缩放比例', exact: true });
    const field = bar.locator('.fivo-zoom-field');
    const normalZoomBorder = await field.evaluate(
      (el) => getComputedStyle(el).borderColor,
    );
    await zoom.click();
    await expect(zoom).toHaveCSS('outline-width', '0px');
    await expect(zoom).toHaveCSS('border-top-width', '0px');
    await expect(field).toHaveCSS('border-top-width', '1px');
    await expect(field).toHaveCSS('box-shadow', 'none');
    expect(
      await field.evaluate((el) => getComputedStyle(el).borderColor),
    ).not.toBe(normalZoomBorder);
    await zoom.fill('90');
    await zoom.press('Enter');
    await expect(zoom).toHaveValue('90');
    await field.screenshot({
      path: 'tmp/toolbar-zoom-focus-' + theme + '.png',
    });
  });
}

for (const theme of ['light', 'dark']) {
  test('工具栏选择菜单与缩放复用弹层：' + theme, async ({ page }) => {
    await fixture(page, '?theme=' + theme);
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    const bar = page.getByRole('toolbar');
    const trigger = bar.getByRole('combobox', {
      name: '表格视图',
      exact: true,
    });
    expect(await trigger.evaluate((el) => el.tagName)).toBe('BUTTON');
    await trigger.click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await expect(list).toHaveCSS('border-radius', '5px');
    await expect(list).toHaveCSS('padding-top', '4px');
    const menuStyle = await list.evaluate((el) => ({
      shadow: getComputedStyle(el).boxShadow,
      background: getComputedStyle(el).backgroundColor,
    }));
    await expect(
      page.getByRole('option', { name: '原始布局', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    const anchor = await trigger.boundingBox();
    const bounds = await list.boundingBox();
    expect(bounds.y - anchor.y - anchor.height).toBe(4);
    await page.screenshot({
      path: 'tmp/select-popup-' + theme + '.png',
      clip: {
        x: bounds.x - 6,
        y: anchor.y - 6,
        width: bounds.width + 12,
        height: bounds.y + bounds.height - anchor.y + 12,
      },
    });
    await trigger.press('ArrowDown');
    await trigger.press('Enter');
    await expect(trigger).toHaveText('阅读模式');
    expect((await state(page)).sheetMode).toBe('reading');
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.press('Home');
    await trigger.press('Escape');
    expect((await state(page)).sheetMode).toBe('reading');
    await trigger.click();
    await trigger.press('Home');
    await trigger.press('Enter');
    await expect(trigger).toHaveText('原始布局');
    const zoom = bar.getByRole('combobox', { name: '缩放比例', exact: true });
    await zoom.click();
    await expect(list).toHaveCount(1);
    expect(await list.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(
      menuStyle.shadow,
    );
    expect(
      await list.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(menuStyle.background);
    await trigger.click();
    await expect(list).toHaveCount(1);
    await expect(zoom).toHaveAttribute('aria-expanded', 'false');
    await trigger.press('Tab');
    await expect(list).toBeHidden();
    await trigger.click();
    await page.getByRole('button', { name: 'Word', exact: true }).click();
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: '内容', exact: true }).click();
    const revision = bar.getByRole('combobox', {
      name: '修订显示',
      exact: true,
    });
    await revision.click();
    await page.getByRole('option', { name: '显示修订', exact: true }).click();
    expect((await state(page)).revisionMode).toBe('markup');
  });
}

test('更多级联菜单支持悬停进入、外部关闭和主题继承', async ({ page }) => {
  await fixture(page, '?width=540&theme=dark');
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  await page.getByRole('button', { name: '内容', exact: true }).click();
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  const menu = page.getByRole('menu', { name: '更多操作', exact: true });
  const parent = menu.locator('[aria-haspopup="menu"]').first();
  const label = await parent.getAttribute('aria-label');
  await parent.hover();
  const child = page.getByRole('menu', { name: label, exact: true });
  await expect(child).toBeVisible();
  await child.locator('button').last().hover();
  await expect(child).toBeVisible();
  await expect(menu).toHaveCSS('border-radius', '8px');
  expect(await child.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe(await menu.evaluate((el) => getComputedStyle(el).backgroundColor));
  await page.locator('#result').click();
  await expect(menu).toBeHidden();
  await expect(child).toHaveCount(0);
});

// 本机二进制样本仅在本地模式读取，截图与报告不会进入公开 CI 目录。
if (process.env.FIVO_LOCAL_SAMPLES === '1') {
  for (const [format, sample] of [
    ['doc', 'binary-word'],
    ['xls', 'binary-sheet'],
    ['ppt', 'binary-slides'],
  ]) {
    test('本机旧格式工具栏：' + format, async ({ page }) => {
      await page.goto(
        server.url + '/?ui=1&sample=' + sample + '&format=' + format,
      );
      await page.locator('#run').click();
      await expect(page.locator('body')).toHaveAttribute(
        'data-state',
        'ready',
        { timeout: 60000 },
      );
      const bar = page.getByRole('toolbar');
      await expect(
        bar.getByRole('combobox', { name: '缩放比例', exact: true }),
      ).toBeVisible();
      await expect(
        bar.locator('[data-fivo-action="office.sheet"]'),
      ).toHaveCount(0);
      if (format !== 'doc')
        await expect(
          bar.locator('[data-fivo-action="office.outline"]'),
        ).toHaveCount(0);
      if (format !== 'ppt')
        await expect(
          bar.getByRole('button', { name: '下一张幻灯片', exact: true }),
        ).toHaveCount(0);
      await bar.screenshot({
        path: 'tmp/testing/local/toolbar-' + format + '.png',
      });
      await page.locator('#destroy').click();
      await expect(bar).toHaveCount(0);
    });
  }
}

test('更多菜单中的缩放通过菜单执行，能力刷新不丢失键盘焦点', async ({ page }) => {
  await fixture(page, '?width=320');
  await page.getByRole('button', { name: '内容', exact: true }).click();
  const bar = page.getByRole('toolbar');
  await bar.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '缩放', exact: true }).press('ArrowRight');
  const choice = page.getByRole('menuitemradio', { name: '125%', exact: true });
  await choice.focus();
  await page
    .getByRole('button', { name: '异步刷新', exact: true })
    .dispatchEvent('click');
  await expect(choice).toBeFocused();
  expect((await state(page)).zoom).toBe(100);
  await choice.press('Enter');
  expect((await state(page)).zoom).toBe(125);
});

test('格式工具栏按内容和顺序展示，切换后不残留旧操作', async ({
  page,
}, info) => {
  await fixture(page);
  const bar = page.getByRole('toolbar');
  await expect(bar.locator('[data-fivo-action="office.outline"]')).toHaveCount(
    0,
  );
  await expect(bar.locator('[data-fivo-action="office.revision"]')).toHaveCount(
    0,
  );
  await expect(bar.getByRole('spinbutton', { name: '页码' })).toHaveCount(0);
  await page.getByRole('button', { name: '内容', exact: true }).click();
  await expect(
    bar.locator('.fivo-controls-main [data-fivo-action]'),
  ).toHaveCount(3);
  expect(
    await bar
      .locator('.fivo-controls-main [data-fivo-action]')
      .evaluateAll((els) => els.map((el) => el.dataset.fivoAction)),
  ).toEqual(['office.outline', 'office.revision', 'office.search']);
  await bar.screenshot({ path: 'tmp/toolbar-word.png' });
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  await expect(bar.locator('[data-fivo-action="office.outline"]')).toHaveCount(
    0,
  );
  await expect(bar.locator('[data-fivo-action="office.sheet"]')).toHaveCount(0);
  await expect(bar.locator('[data-fivo-action="office.review"]')).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '内容', exact: true }).click();
  expect(
    await bar
      .locator('.fivo-controls-main [data-fivo-action]')
      .evaluateAll((els) => els.map((el) => el.dataset.fivoAction)),
  ).toEqual(['office.sheetMode', 'office.search', 'office.review']);
  await expect(
    bar.locator(
      '[data-fivo-action="office.sheetMode"] > .fivo-capability-label',
    ),
  ).toBeHidden();
  await bar.screenshot({ path: 'tmp/toolbar-excel.png' });
  await page.getByRole('button', { name: 'PPT', exact: true }).click();
  await expect(
    bar.locator('[data-fivo-action="office.transitions"]'),
  ).toHaveCount(0);
  const previous = bar.getByRole('button', {
    name: '上一张幻灯片',
    exact: true,
  });
  const next = bar.getByRole('button', { name: '下一张幻灯片', exact: true });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await bar.screenshot({ path: 'tmp/toolbar-ppt.png' });
  await page.getByRole('button', { name: '单页', exact: true }).click();
  await expect(next).toHaveCount(0);
  await info.attach('toolbar-ppt', {
    body: await bar.screenshot(),
    contentType: 'image/png',
  });
});

test('缩放组合框支持预设、模式、同值确认、输入边界和键盘', async ({ page }) => {
  await fixture(page);
  const zoom = page.getByRole('combobox', { name: '缩放比例', exact: true });
  await zoom.click();
  await page.getByRole('option', { name: '适应宽度', exact: true }).click();
  expect((await state(page)).zoomMode).toBe('fit-width');
  await zoom.press('Enter');
  expect((await state(page)).zoomMode).toBe('percentage');
  await zoom.click();
  await page.getByRole('option', { name: '125%', exact: true }).click();
  await expect(zoom).toHaveValue('125');
  await zoom.fill('0');
  await zoom.press('Enter');
  await expect(zoom).toHaveValue('25');
  await zoom.fill('999');
  await zoom.press('Tab');
  await expect(zoom).toHaveValue('300');
  await zoom.fill('');
  await zoom.press('Tab');
  await expect(zoom).toHaveValue('300');
  await zoom.fill('180');
  await page
    .getByRole('button', { name: '异步刷新', exact: true })
    .dispatchEvent('click');
  await expect(zoom).toHaveValue('180');
  await zoom.press('Escape');
  await expect(zoom).toHaveValue('300');
  await zoom.press('ArrowDown');
  await zoom.press('Enter');
  expect((await state(page)).zoomMode).toBe('fit-width');
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  await zoom.click();
  await expect(
    page.getByRole('option', { name: '适应页面', exact: true }),
  ).toHaveCount(0);
});

test('窄屏嵌套菜单、主题与旧插件保持可用', async ({ page }) => {
  await fixture(page, '?width=320&theme=dark&locale=en-US');
  await page.getByRole('button', { name: '内容', exact: true }).click();
  const bar = page.getByRole('toolbar');
  const more = bar.getByRole('button', { name: 'More actions', exact: true });
  await more.click();
  await page.getByRole('menuitem', { name: 'Zoom', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '125%', exact: true }).click();
  expect((await state(page)).zoom).toBe(125);
  await more.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'More actions', exact: true })).toBeHidden();
  await expect(more).toBeFocused();
  expect(
    await bar.evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await page.locator('#preview').evaluate((el) => {
    el.style.width = '1100px';
  });
  const zoom = bar.getByRole('combobox', { name: 'Zoom percentage', exact: true });
  await expect(zoom).toBeVisible();
  await bar.screenshot({ path: 'tmp/toolbar-dark.png' });
  await page.getByRole('button', { name: '通用', exact: true }).click();
  const basic = bar.getByRole('spinbutton', {
    name: 'Zoom percentage',
    exact: true,
  });
  await expect(basic).toBeVisible();
  await basic.fill('125.5');
  await basic.press('Enter');
  expect((await state(page)).legacyZoom).toBe(125.5);
  await expect(
    bar.getByRole('spinbutton', { name: 'Page', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '销毁工具栏', exact: true }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('menu')).toHaveCount(0);
});
