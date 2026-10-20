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

test('Markdown 大纲使用公共树线，折叠不跳正文并保留标题键盘导航', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const outline = page.locator('.fivo-markdown-outline'), tree = outline.getByRole('tree');
  const root = tree.getByRole('treeitem', { name: '示例', exact: true });
  const child = tree.getByRole('treeitem', { name: '跳级章节', exact: true });
  await expect(child).toHaveAttribute('aria-level', '2');
  await expect(child.locator('.fivo-outline-branch')).toHaveAttribute('data-continues', 'true');
  await expect(child.locator('.fivo-outline-label')).toHaveCSS('font-size', '14px');
  const scroll = page.locator('.fivo-markdown-scroll');
  const before = await scroll.evaluate((node) => node.scrollTop);
  await root.getByRole('button', { name: '收起 示例', exact: true }).click();
  await expect(child).toHaveCount(0);
  expect(await scroll.evaluate((node) => node.scrollTop)).toBe(before);
  await root.press('ArrowRight'); await root.press('ArrowRight');
  await expect(child).toBeFocused();
});

/** 更多菜单保留开关项编辑状态，避免重复点击把已打开的菜单反向关闭。 */
async function openMore(page) {
  const more = page.locator('.fivo-toolbar-more');
  const trigger = more.locator('.fivo-toolbar-more-trigger');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  return page.getByRole('menu', { name: '更多操作', exact: true });
}

test('Markdown 菜单按内容收窄，编码与视图使用图标，子菜单独立定宽', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const menu = await openMore(page);
  expect(await page.locator('.fivo-toolbar').evaluate((element) =>
    element.lastElementChild.classList.contains('fivo-toolbar-more'))).toBe(true);
  const root = await menu.boundingBox();
  expect(root.width).toBeGreaterThanOrEqual(160);
  expect(root.width).toBeLessThan(224);
  for (const name of ['编码', '视图']) {
    const parent = menu.getByRole('menuitem', { name, exact: true });
    await expect(parent.locator(':scope > svg')).toHaveCount(1);
    await parent.click();
    const child = page.getByRole('menu', { name, exact: true });
    const bounds = await child.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(112);
    expect(bounds.width).toBeLessThanOrEqual(160);
    expect(bounds.width).toBeLessThan(root.width);
    await page.keyboard.press('Escape');
    await expect(menu).toBeVisible();
  }
});

for (const format of ['文本', 'JSON', 'Markdown']) {
  test(`${format} 更多菜单的每个第一级操作都显示图标`, async ({ page }) => {
    await page.goto(server.url + '/text-formats.html');
    await page.getByRole('button', { name: format, exact: true }).click();
    const menu = await openMore(page);
    const rows = menu.locator(':scope > button');
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all())
      await expect(row.locator(':scope > svg.fivo-icon')).toHaveCount(1);
    if (format === '文本') {
      const wrap = menu.getByRole('menuitemcheckbox', { name: '自动换行', exact: true });
      const checked = await wrap.getAttribute('aria-checked');
      await wrap.click();
      await expect(wrap).toHaveAttribute('aria-checked', String(checked !== 'true'));
      await expect(wrap.locator(':scope > svg.fivo-icon')).toHaveCount(1);
      await expect(menu.getByRole('menuitemcheckbox', { name: '行号', exact: true })
        .locator(':scope > svg.fivo-icon')).toHaveCount(1);
    }
  });

  test(`${format} 编码勾选实际结果，重新识别是独立命令`, async ({ page }) => {
    await page.goto(server.url + '/text-formats.html');
    await page.getByRole('button', { name: format, exact: true }).click();
    const menu = await openMore(page);
    const encoding = menu.getByRole('menuitem', { name: '编码', exact: true });
    await expect(encoding.locator('.fivo-menu-value')).toHaveText('UTF-8');
    await encoding.click();
    const child = page.getByRole('menu', { name: '编码', exact: true });
    await expect(child.getByRole('menuitemradio')).toHaveCount(5);
    await expect(child.getByRole('menuitemradio', { name: 'UTF-8', exact: true }))
      .toHaveAttribute('aria-checked', 'true');
    await expect(child.getByRole('menuitemradio', { name: /自动/ })).toHaveCount(0);
    const retry = child.getByRole('menuitem', { name: '重新自动识别', exact: true });
    await expect(retry).not.toHaveAttribute('aria-checked');
    expect(await retry.evaluate((element) => element.previousElementSibling.getAttribute('role')))
      .toBe('separator');
    // 已处于自动模式时也允许再次执行，不把命令误当成已选选项而跳过。
    for (let attempt = 0; attempt < 2; attempt++) {
      await retry.click();
      await expect(page.locator('.fivo-toolbar-more-trigger')).toHaveAttribute('aria-expanded', 'false');
      await openMore(page);
      await expect(encoding.locator('.fivo-menu-value')).toHaveText('UTF-8');
      await encoding.click();
      await expect(child.getByRole('menuitemradio', { name: 'UTF-8', exact: true }))
        .toHaveAttribute('aria-checked', 'true');
    }
  });
}

for (const [kind, selector] of [
  ['encodingText', '.fivo-text-surface'],
  ['encodingJson', '.fivo-json-workspace'],
  ['encodingMarkdown', '.fivo-markdown-reading'],
]) {
  test(`${kind} 切换编码失败保留正文 DOM 与位置，浮窗提示后可恢复`, async ({ page }) => {
    await page.goto(server.url + '/text-formats.html');
    await page.evaluate((kind) => window.fivoTextFormats.open(kind), kind);
    await expect(page.locator(selector)).toBeVisible();
    if (kind === 'encodingJson') await expect(page.locator('.fivo-json-tree')).toBeVisible();
    const retained = await page.evaluate(async (selector) => {
      const content = document.querySelector(selector);
      const outline = document.querySelector('.fivo-markdown-outline');
      const scroll = content.querySelector('.fivo-text-viewport, .fivo-markdown-scroll');
      if (scroll) scroll.scrollTop = 120;
      const top = scroll?.scrollTop;
      const action = window.fivoTextFormats.getCapabilities().actions.find((item) => item.id.endsWith('.encoding'));
      const pending = action.run('utf-16le');
      const during = document.querySelector(selector) === content;
      await pending;
      return {
        during,
        after: document.querySelector(selector) === content,
        position: !scroll || scroll.scrollTop === top,
        outline: !outline || document.querySelector('.fivo-markdown-outline') === outline,
      };
    }, selector);
    expect(retained).toEqual({ during: true, after: true, position: true, outline: true });
    const notice = page.locator('.fivo-reading-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('无法使用 UTF-16LE 解码此文件');
    await expect(notice).toContainText('当前编码为 UTF-8');
    const menu = await openMore(page);
    const encoding = menu.getByRole('menuitem', { name: '编码', exact: true });
    await expect(encoding.locator('.fivo-menu-value')).toHaveText('UTF-8');
    await encoding.click();
    await page.getByRole('menu', { name: '编码', exact: true })
      .getByRole('menuitem', { name: '重新自动识别', exact: true }).click();
    await expect(notice).toBeHidden();
    await expect(page.locator(selector)).toBeVisible();
  });
}

test('编码提示可关闭，刷新不重弹，新一次失败只显示一条，切换文件清理提示', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.evaluate(() => window.fivoTextFormats.open('encodingMarkdown'));
  await expect(page.locator('.fivo-markdown-reading')).toBeVisible();
  const fail = () => page.evaluate(() => window.fivoTextFormats.getCapabilities().actions
    .find((item) => item.id === 'markdown.encoding').run('utf-16le'));
  await fail();
  const notice = page.locator('.fivo-reading-notice');
  await notice.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.evaluate(() => window.fivoTextFormats.update({ zoom: 110 }));
  await expect(notice).toBeHidden();
  await fail();
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCount(1);
  await page.evaluate(() => window.fivoTextFormats.open('encodingText'));
  await expect(page.locator('.fivo-text-surface')).toBeVisible();
  await expect(page.locator('.fivo-reading-notice')).toBeHidden();
});

test('首次解码失败保留正常尺寸的编码恢复入口和当前尝试值', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.evaluate(() => window.fivoTextFormats.open('unreadableText'));
  const recovery = page.locator('.fivo-reading-status');
  await expect(recovery).toBeVisible();
  const choice = recovery.getByRole('combobox', { name: '编码', exact: true });
  await expect(choice).toHaveText('编码');
  expect((await choice.boundingBox()).width).toBeGreaterThanOrEqual(144);
  await choice.click();
  await page.getByRole('option', { name: 'UTF-16LE', exact: true }).click();
  await expect(recovery.getByRole('combobox', { name: '编码', exact: true })).toHaveText('UTF-16LE');
  await expect(page.locator('.fivo-reading-notice')).toBeHidden();
});

for (const [label, parser, surface] of [
  ['文本', undefined, 'text'],
  ['JSON 原文', undefined, 'text'],
  ['JSON', 'json', 'json'],
  ['Markdown 原文', undefined, 'text'],
  ['Markdown', 'markdown', 'markdown'],
]) {
  test(
    label + ' 的真实网络请求符合加载边界，销毁释放格式样式',
    async ({ page, request }) => {
      const graph = await (
        await request.get(server.url + '/asset-graph.json')
      ).json();
      const seen = new Set();
      page.on('request', (request) =>
        seen.add(new URL(request.url()).pathname),
      );
      const loaded = () => [...seen].flatMap((path) => graph[path] ?? []);
      await page.goto(server.url + '/text-formats.html');
      expect(
        loaded().some((file) =>
          /\/src\/(?:parser|view|runtime)\/|marked|highlight\.js/.test(file),
        ),
      ).toBe(false);
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(
        page.locator(
          surface === 'text'
            ? '.fivo-text-surface'
            : '.fivo-' + surface + (surface === 'json' ? '-tree' : '-reading'),
        ),
      ).toBeVisible();
      const files = loaded();
      expect(
        files.some((file) => /json\/src\/parser\/scanJson/.test(file)),
      ).toBe(parser === 'json');
      expect(
        files.some((file) => /markdown\/src\/parser\/parseMarkdown/.test(file)),
      ).toBe(parser === 'markdown');
      expect(files.some((file) => /highlight\.js/.test(file))).toBe(false);
      await page.evaluate(() => window.fivoTextFormats.dispose());
      await expect(
        page.locator(
          'style[data-fivo-style^="text:"],style[data-fivo-style^="json:"],style[data-fivo-style^="markdown:"]',
        ),
      ).toHaveCount(0);
    },
  );
}

test('同一 Markdown 会话切换模式后恢复原文滚动位置', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page
    .getByRole('button', { name: 'Markdown 原文', exact: true })
    .click();
  const viewport = page.locator('.fivo-text-viewport');
  await expect(viewport).toBeVisible();
  await viewport.evaluate((element) => {
    element.scrollTop = 500;
  });
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await openMore(page);
  await page.getByRole('menuitem', { name: '视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '阅读', exact: true }).click();
  await expect(page.locator('.fivo-markdown-reading')).toBeVisible();
  await openMore(page);
  await page.getByRole('menuitem', { name: '视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '原文', exact: true }).click();
  await expect(viewport).toBeVisible();
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});

test('文本、编码恢复和 JSON 原文切换使用真实会话', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: '文本', exact: true }).click();
  await expect(page.locator('.fivo-text-line-content').first()).toHaveText(
    '第一行',
  );
  await page.getByRole('button', { name: 'GBK', exact: true }).click();
  await expect(page.locator('.fivo-text-line-content').first()).toHaveText(
    '中文',
  );
  await openMore(page);
  await expect(
    page.getByRole('menuitem', { name: '编码', exact: true }),
  ).toContainText('GB18030');
  await page.getByRole('menuitem', { name: '编码', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'GB18030', exact: true }))
    .toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: 'GBK', exact: true }).click();
  await openMore(page);
  await expect(page.getByRole('menuitem', { name: '编码', exact: true }).locator('.fivo-menu-value'))
    .toHaveText('GBK');
  await page.getByRole('menuitem', { name: '编码', exact: true }).click();
  await page.getByRole('menuitem', { name: '重新自动识别', exact: true }).click();
  await openMore(page);
  await expect(page.getByRole('menuitem', { name: '编码', exact: true }).locator('.fivo-menu-value'))
    .toHaveText('GB18030');
  await page.getByRole('menuitem', { name: '编码', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'UTF-8', exact: true }).click();
  await expect(page.locator('.fivo-reading-notice')).toContainText('无法使用 UTF-8 解码此文件');
  await expect(page.locator('.fivo-text-line-content').first()).toHaveText('中文');
  await openMore(page);
  await page.getByRole('menuitem', { name: '编码', exact: true }).click();
  await expect(page.getByRole('menu', { name: '编码', exact: true })
    .getByRole('menuitemradio', { name: 'GB18030', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menu', { name: '编码', exact: true })
    .getByRole('menuitem', { name: '重新自动识别', exact: true }).click();
  await expect(page.locator('.fivo-reading-notice')).toBeHidden();
  await expect(page.locator('.fivo-text-line-content').first()).toHaveText(
    '中文',
  );
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.locator('.fivo-json-tree')).toBeVisible();
  await expect(page.locator('.fivo-text-line-number').first()).toBeVisible();
  await expect(page.locator('.fivo-text-filler-number')).toHaveCount(0);
  await expect(
    page
      .locator('.fivo-json-tree')
      .getByText('900719925474099312345', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await expect(page.locator('.fivo-text-surface')).toBeVisible();
  await expect(page.locator('.fivo-text-line-number').first()).toBeVisible();
  await expect(page.locator('.fivo-json-tree')).toHaveCount(0);
  await page.getByRole('button', { name: '无效 JSON', exact: true }).click();
  await expect(page.getByText(/JSON 语法错误/)).toBeVisible();
});

test('文本菜单集中次要操作，行号默认开启且可切换，查找打开后菜单收起', async ({
  page,
}) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: '文本', exact: true }).click();
  await expect(
    page.locator('.fivo-controls-main [data-fivo-action^="text."]'),
  ).toHaveCount(0);
  await expect(page.locator('.fivo-text-line-number').first()).toBeVisible();
  await expect(page.locator('.fivo-text-filler-number')).toHaveCount(0);
  const menu = await openMore(page);
  await expect(
    menu.getByRole('menuitem', { name: '编码', exact: true }),
  ).toBeVisible();
  await expect(menu.locator('input, select, [role="combobox"], [role="switch"]')).toHaveCount(0);
  const labelPositions = await menu.locator('.fivo-menu-label').evaluateAll((labels) =>
    labels.map((label) => label.getBoundingClientRect().left));
  expect(Math.max(...labelPositions) - Math.min(...labelPositions)).toBeLessThanOrEqual(1);
  const lines = menu.getByRole('menuitemcheckbox', { name: '行号', exact: true });
  await expect(lines).toHaveAttribute('aria-checked', 'true');
  await lines.click();
  await expect(lines).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.fivo-text-line-number:visible')).toHaveCount(0);
  await lines.click();
  await expect(lines).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.fivo-text-line-number').first()).toBeVisible();
  await menu.getByRole('menuitem', { name: '查找', exact: true }).click();
  await expect(page.locator('.fivo-toolbar-more-trigger')).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.locator('.fivo-text-find input[type="search"]'),
  ).toBeFocused();
});

test('JSON 行号菜单带图标，开关状态在缩放及视图切换后保留', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.locator('.fivo-text-line-number').first()).toBeVisible();
  const menu = await openMore(page),
    lines = menu.getByRole('menuitemcheckbox', { name: '行号', exact: true });
  await expect(lines.locator('[data-name="lines"] svg')).toBeVisible();
  await expect(lines).toHaveAttribute('aria-checked', 'true');
  await lines.click();
  await expect(lines).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.fivo-text-line-number:visible')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.fivoTextFormats.update({ zoom: 150 }));
  await openMore(page);
  await expect(lines).toHaveAttribute('aria-checked', 'false');
  await menu.getByRole('menuitem', { name: '视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '原文', exact: true }).click();
  await expect(page.locator('.fivo-text-line-number:visible')).toHaveCount(0);
  await openMore(page);
  await lines.click();
  await expect(lines).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.fivo-text-line-number').first()).toBeVisible();
  await menu.getByRole('menuitem', { name: '视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '双栏', exact: true }).click();
  await expect(page.locator('.fivo-json-tree')).toBeVisible();
  await expect(page.locator('.fivo-text-line-number').first()).toBeVisible();
});

test('JSON 分支只有一个按钮，标签随树状态变化，叶节点禁用', async ({
  page,
}) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.locator('.fivo-json-tree')).toBeVisible();
  const menu = await openMore(page);
  await menu.getByRole('menuitem', { name: '收起分支', exact: true }).click();
  await openMore(page);
  await expect(
    menu.getByRole('menuitem', { name: '展开分支', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await menu.getByRole('menuitem', { name: '展开分支', exact: true }).click();
  await openMore(page);
  await expect(
    menu.getByRole('menuitem', { name: '收起分支', exact: true }),
  ).toBeVisible();
  await page.locator('.fivo-json-value--null').click();
  await openMore(page);
  await expect(
    menu.getByRole('menuitem', { name: '展开分支', exact: true }),
  ).toBeDisabled();
});

test('Markdown 大纲保留在主工具栏，并反映侧栏开关状态', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const outline = page
    .locator('.fivo-controls-main')
    .getByRole('button', { name: '大纲', exact: true });
  await expect(outline).toBeVisible();
  await expect(outline).toHaveAttribute('aria-pressed', 'true');
  await outline.click();
  await expect(page.locator('.fivo-markdown-outline')).toBeHidden();
  await expect(outline).toHaveAttribute('aria-pressed', 'false');
  const menu = await openMore(page);
  await expect(
    menu.getByRole('menuitemcheckbox', { name: '大纲', exact: true }),
  ).toHaveCount(0);
});

for (const scrollable of [false, true]) {
  test(`Markdown 短文档${scrollable ? '定位受底部限制' : '无需滚动'}时保留点击的章节`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 1200 });
    await page.goto(server.url + '/text-formats.html');
    await page.getByRole('button', { name: 'Markdown 短文档', exact: true }).click();
    const scroll = page.locator('.fivo-markdown-scroll');
    const outline = page.locator('.fivo-markdown-outline');
    await expect(outline).toBeVisible();
    await page.locator('.fivo-viewer').evaluate((element) => { element.style.height = '1000px'; });
    await scroll.evaluate((element, constrained) => {
      if (!constrained) return;
      const article = element.querySelector('article');
      const task = [...article.querySelectorAll('h2')].find((heading) => heading.textContent === '任务');
      const top = task.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
      // 让最大滚动距离小于任务标题的定位距离，稳定覆盖底部截断而非依赖截图尺寸。
      element.style.maxHeight = (article.getBoundingClientRect().height - (top - 16) / 2) + 'px';
    }, scrollable);
    const settle = () => page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await settle();
    const code = outline.getByRole('treeitem', { name: '代码', exact: true });
    const tasks = outline.getByRole('treeitem', { name: '任务', exact: true });
    await code.click();
    await settle();
    await expect(code).toHaveAttribute('aria-selected', 'true');
    await tasks.click();
    await settle();
    await expect(tasks).toHaveAttribute('aria-selected', 'true');
    const position = await scroll.evaluate((element) => ({
      top: element.scrollTop,
      max: element.scrollHeight - element.clientHeight,
    }));
    if (scrollable) {
      expect(position.max).toBeGreaterThan(0);
      expect(Math.abs(position.top - position.max)).toBeLessThan(1);
    } else expect(position.max).toBe(0);
    await code.click();
    await page.getByRole('link', { name: '跳转任务', exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await settle();
    await expect(tasks).toHaveAttribute('aria-selected', 'true');
    if (scrollable) {
      await scroll.evaluate((element) => { element.scrollTop = 0; });
      await expect(outline.getByRole('treeitem', { name: 'Markdown 示例', exact: true }))
        .toHaveAttribute('aria-selected', 'true');
      await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(code).toHaveAttribute('aria-selected', 'true');
    }
  });
}

for (const action of ['目录', '正文锚点', '查找']) {
  test(`Markdown ${action}定位仅滚动正文，目录和外层位置保持不变`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(server.url + '/text-formats.html');
    // 宿主页面也可滚动，避免只在铺满窗口的容器中漏掉祖先滚动问题。
    await page.addStyleTag({
      content: 'body { padding-top: 180px; padding-bottom: 400px; }',
    });
    await page.getByRole('button', { name: 'Markdown', exact: true }).click();
    const outline = page.locator('.fivo-markdown-outline'),
      scroll = page.locator('.fivo-markdown-scroll');
    await expect(outline).toBeVisible();
    if (action === '查找') {
      const menu = await openMore(page);
      await menu.getByRole('menuitem', { name: '查找', exact: true }).click();
      await expect(page.locator('.fivo-markdown-find input')).toBeFocused();
    } else if (action === '正文锚点') {
      await expect(
        page.getByRole('link', { name: '跳转到定位目标', exact: true }),
      ).toHaveAttribute('href', /#fivo-md-\d+-/);
    }
    const outerPosition = () =>
      page.evaluate(() => {
        const outline = document.querySelector('.fivo-markdown-outline'),
          scroll = document.querySelector('.fivo-markdown-scroll'),
          ancestors = [];
        for (
          let element = scroll.parentElement;
          element;
          element = element.parentElement
        )
          ancestors.push({ top: element.scrollTop, left: element.scrollLeft });
        return {
          ancestors,
          pageTop: window.scrollY,
          pageLeft: window.scrollX,
          outlineTop: outline.getBoundingClientRect().top,
          outlineScroll: outline.scrollTop,
          outlineHidden: outline.hidden,
        };
      });
    const before = await outerPosition();
    if (action === '目录')
      await outline
        .getByRole('treeitem', { name: '定位目标', exact: true })
        .click();
    else if (action === '正文锚点')
      await page.getByRole('link', { name: '跳转到定位目标', exact: true }).click();
    else {
      await page.locator('.fivo-markdown-find input').fill('目录与锚点定位目标');
      await expect(page.locator('.fivo-markdown-find output')).toHaveText(
        '1 / 1',
      );
    }
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(500);
    expect(await outerPosition()).toEqual(before);
    await expect(outline).toBeVisible();
    if (action === '查找') {
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
        '目录与锚点定位目标',
      );
      const position = await page
        .locator('.fivo-markdown-article p')
        .evaluateAll((elements) => {
          const target = elements.find(
              (element) =>
                element.textContent === '这里是目录与锚点定位目标。',
            ),
            viewport = target
              .closest('.fivo-markdown-scroll')
              .getBoundingClientRect(),
            rect = target.getBoundingClientRect();
          return Math.abs(
            (rect.top + rect.bottom) / 2 -
              (viewport.top + viewport.bottom) / 2,
          );
        });
      expect(position).toBeLessThan(40);
    } else {
      const offset = await page
        .getByRole('heading', { name: '定位目标', exact: true })
        .evaluate(
          (element) =>
            element.getBoundingClientRect().top -
            element.closest('.fivo-markdown-scroll').getBoundingClientRect()
              .top,
        );
      expect(Math.abs(offset - 16)).toBeLessThan(1);
    }
  });
}

test('Markdown 树形大纲对齐真实层级，折叠、正文同步及宽度调整保持状态', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const outline = page.locator('.fivo-markdown-outline'),
    scroll = page.locator('.fivo-markdown-scroll'),
    root = outline.getByRole('treeitem', { name: '示例', exact: true }),
    child = outline.getByRole('treeitem', { name: '跳级章节', exact: true });
  await expect(outline.locator('.fivo-markdown-outline-count')).toHaveText('4');
  await expect(root).toHaveAttribute('aria-level', '1');
  await expect(child).toHaveAttribute('aria-level', '2');
  await expect(outline.getByRole('treeitem', { name: '子章节', exact: true }))
    .toHaveAttribute('aria-level', '3');
  await root.getByRole('button', { name: '收起 示例', exact: true }).click();
  await expect(outline.getByRole('treeitem')).toHaveCount(1);
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0);
  await root.getByRole('button', { name: '展开 示例', exact: true }).click();
  await expect(outline.getByRole('treeitem')).toHaveCount(4);
  await root.focus();
  await root.press('ArrowDown');
  await expect(child).toBeFocused();
  await child.press('Enter');
  await expect(child).toHaveAttribute('aria-selected', 'true');
  // 直接滚动正文，验证选中态同步不会反向调用章节跳转。
  await scroll.evaluate((element) => {
    const target = element.querySelector('h2');
    element.scrollTop += target.getBoundingClientRect().top -
      element.getBoundingClientRect().top - 16;
  });
  await expect(outline.getByRole('treeitem', { name: '定位目标', exact: true }))
    .toHaveAttribute('aria-selected', 'true');
  const before = await outline.boundingBox();
  const handle = outline.getByRole('separator', { name: '调整大纲宽度', exact: true });
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(async () => (await outline.boundingBox()).width)
    .toBeCloseTo(before.width + 40, 0);
  await handle.focus();
  await handle.press('ArrowLeft');
  await expect.poll(async () => (await outline.boundingBox()).width)
    .toBeCloseTo(before.width + 20, 0);
  await outline.getByRole('button', { name: '收起大纲', exact: true }).click();
  await expect(outline).toBeHidden();
  const toggle = page.locator('.fivo-controls-main')
    .getByRole('button', { name: '大纲', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(outline).toBeVisible();
  expect((await outline.boundingBox()).width).toBeCloseTo(before.width + 20, 0);
  await page.getByRole('button', { name: 'Markdown 原文', exact: true }).click();
  await expect(outline).toHaveCount(0);
});

test('Markdown 排版隔离 HTML，非首屏代码可见后才着色', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('.fivo-markdown-table table')).toBeVisible();
  expect(await page.evaluate(() => window.untrusted)).toBeUndefined();
  const code = page.locator('.fivo-markdown-code[data-language="python"]');
  await expect(code).not.toHaveAttribute('data-highlighted', 'true');
  await code.scrollIntoViewIfNeeded();
  await expect(code).toHaveAttribute('data-highlighted', 'true');
  await page
    .getByRole('button', { name: 'Markdown 原文', exact: true })
    .click();
  await expect(page.locator('.fivo-text-surface')).toBeVisible();
  await expect(page.locator('.fivo-markdown-reading')).toHaveCount(0);
});

test('Markdown 停用期间语言更新在恢复时生效，并保留正文位置', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const scroll = page.locator('.fivo-markdown-scroll');
  await expect(scroll).toBeVisible();
  await scroll.evaluate((element) => { element.scrollTop = 240; });
  const top = await scroll.evaluate((element) => element.scrollTop);
  await page.evaluate(() => {
    window.fivoTextFormats.setActive(false);
    window.fivoTextFormats.update({ locale: 'en-US' });
    window.fivoTextFormats.setActive(true);
  });
  await expect(page.locator('.fivo-markdown-outline')).toHaveAttribute('aria-label', 'Outline');
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(top);
  // 没有待处理更新时恢复现有 DOM，不因激活重复重建内容。
  expect(await page.evaluate(() => {
    const article = document.querySelector('.fivo-markdown-article');
    window.fivoTextFormats.setActive(false);
    window.fivoTextFormats.setActive(true);
    return document.querySelector('.fivo-markdown-article') === article;
  })).toBe(true);
});

test('Markdown 停用期间切换阅读模式，恢复后使用最新状态', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('.fivo-markdown-reading')).toBeVisible();
  await page.evaluate(async () => {
    window.fivoTextFormats.setActive(false);
    await window.fivoTextFormats.getCapabilities().actions.find((action) => action.id === 'markdown.mode').run('source');
    window.fivoTextFormats.setActive(true);
  });
  await expect(page.locator('.fivo-text-surface')).toBeVisible();
  await expect(page.locator('.fivo-markdown-reading')).toHaveCount(0);
});

test('Markdown 停用期间重读内容，恢复后重建并清除旧位置', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const scroll = page.locator('.fivo-markdown-scroll');
  await expect(scroll).toBeVisible();
  await scroll.evaluate((element) => { element.scrollTop = 240; });
  await page.evaluate(async () => {
    window.fivoTextFormats.setActive(false);
    await window.fivoTextFormats.getCapabilities().actions.find((action) => action.id === 'markdown.encoding').run('utf-8');
    window.fivoTextFormats.setActive(true);
  });
  await expect(scroll).toBeVisible();
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator('.fivo-markdown-article')).toContainText('这里是目录与锚点定位目标');
});

test('Text 查找栏切换语言时保持查询状态，无结果提示同步翻译', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: '文本', exact: true }).click();
  await expect(page.locator('.fivo-text-surface')).toBeVisible();
  const menu = await openMore(page);
  await menu.getByRole('menuitem', { name: '查找', exact: true }).click();
  const query = page.getByRole('searchbox', { name: '查找文本' });
  await query.fill('definitely-absent');
  const status = page.locator('.fivo-text-find output');
  await expect(status).toHaveText('未找到');
  await page.evaluate(() => window.fivoTextFormats.update({ locale: 'en-US' }));
  await expect(query).toHaveCount(0);
  const translated = page.getByRole('searchbox', { name: 'Find text' });
  await expect(translated).toHaveValue('definitely-absent');
  await expect(translated).toBeFocused();
  await expect(page.locator('.fivo-text-find').getByRole('button', { name: 'Previous', exact: true })).toBeVisible();
  await expect(status).toHaveText('No matches');
});

test('JSON 双栏着色、节点联动、收起恢复与只读选择', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const source = page.locator('.fivo-json-pane--source'),
    tree = page.locator('.fivo-json-pane--tree');
  await expect(source).toBeVisible();
  await expect(tree).toBeVisible();
  await expect(source.locator('.fivo-json-token-key').first()).toBeVisible();
  await expect(tree.getByText('Object (4)', { exact: true })).toBeVisible();
  await tree.locator('.fivo-json-value--number').first().click();
  await expect(source.locator('.fivo-text-reveal').first()).toBeVisible();
  await expect(source.locator('textarea,[contenteditable="true"]')).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '收起结构', exact: true }).click();
  await expect(tree).toBeHidden();
  await expect(source).toBeVisible();
  await page.getByRole('button', { name: '显示结构', exact: true }).click();
  await expect(tree).toBeVisible();
  await page.getByRole('button', { name: '无效 JSON', exact: true }).click();
  await expect(page.locator('.fivo-text-surface')).toBeVisible();
  await expect(page.getByText(/JSON 语法错误/)).toBeVisible();
});

test('JSON 窄屏结构不请求隐藏代码区，切换后才加载', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 600, height: 800 });
  const graph = await (
    await request.get(server.url + '/asset-graph.json')
  ).json();
  const seen = new Set();
  page.on('request', (request) => seen.add(new URL(request.url()).pathname));
  const files = () => [...seen].flatMap((path) => graph[path] ?? []);
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.locator('.fivo-json-tree')).toBeVisible();
  await expect(page.locator('.fivo-json-pane--source')).toBeHidden();
  expect(
    files().some((file) =>
      /json\/src\/view\/(?:JsonSource|jsonTokens)/.test(file),
    ),
  ).toBe(false);
  await page.getByRole('button', { name: '收起结构', exact: true }).click();
  await expect(page.locator('.fivo-text-surface')).toBeVisible();
  expect(files().some((file) => /json\/src\/view\/jsonTokens/.test(file))).toBe(
    true,
  );
});

test('Markdown 任务框只出现一次，代码原文和格式标题正确显示', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown 排版', exact: true }).click();
  const article = page.locator('.fivo-markdown-article'),
    tasks = article.locator('.fivo-markdown-task-item');
  await expect(tasks).toHaveCount(4);
  await expect(article.locator('input[type="checkbox"]')).toHaveCount(4);
  await expect(article.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  await expect(article).toContainText('普通文字 [ ] 保留，不是任务项。');
  for (const task of await tasks.all()) {
    await expect(task.locator('input[type="checkbox"]')).toHaveCount(1);
    await expect(task.locator('input')).toBeDisabled();
    expect(await task.evaluate((element) => getComputedStyle(element).listStyleType))
      .toBe('none');
    expect(await task.innerText()).not.toMatch(/\[(?: |x)\]/i);
  }
  const ordinary = article.locator('li').filter({ hasText: '普通列表项' }).first();
  expect(await ordinary.evaluate((element) => getComputedStyle(element).listStyleType))
    .toBe('disc');
  expect(await article.locator('code').allTextContents())
    .toContain('&amp; <Widget>  a');
  await expect(article).not.toContainText('[reference]:');
  await expect(article.getByRole('link', { name: '参考链接', exact: true }))
    .toHaveAttribute('href', 'https://example.com/');
  await expect(article.locator('widget')).toHaveCount(0);
  await expect(page.locator('.fivo-markdown-outline').getByRole('treeitem', {
    name: '重点 与 API & 说明', exact: true,
  })).toBeVisible();
  const jump = article.getByRole('link', { name: '定位格式标题', exact: true });
  await expect(jump).toHaveAttribute('href', /#fivo-md-/);
  await jump.click();
  await expect.poll(() => page.locator('.fivo-markdown-scroll')
    .evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(article.locator('ol')).toHaveAttribute('start', '3');
  await expect(article.locator('p').filter({ hasText: '第一行' }).locator('br'))
    .toHaveCount(1);
  await expect(article.locator('p').filter({ hasText: '软换行 A' }).locator('br'))
    .toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`Markdown ${theme} 阅读样式覆盖标题、引用、表格和分隔线`, async ({ page }) => {
    await page.goto(server.url + '/text-formats.html?theme=' + theme);
    await page.getByRole('button', { name: 'Markdown 排版', exact: true }).click();
    const article = page.locator('.fivo-markdown-article');
    await expect(article).toBeVisible();
    const layout = await article.evaluate((element) => {
      const style = (selector) => getComputedStyle(element.querySelector(selector));
      const code = element.querySelector('code');
      return {
        firstMargin: style('h1').marginTop,
        bodySize: parseFloat(getComputedStyle(element).fontSize),
        h5Size: parseFloat(style('h5').fontSize),
        h6Size: parseFloat(style('h6').fontSize),
        width: element.getBoundingClientRect().width,
        viewportWidth: element.closest('.fivo-markdown-scroll').clientWidth,
        quoteStart: style('blockquote > :first-child').marginTop,
        quoteEnd: style('blockquote > :last-child').marginBottom,
        tableWidth: element.querySelector('table').getBoundingClientRect().width,
        tableContainerWidth: element.querySelector('.fivo-markdown-table').clientWidth,
        align: [...element.querySelectorAll('tbody td')].map((cell) => getComputedStyle(cell).textAlign),
        hrStyle: style('hr').borderTopStyle,
        hrWidth: style('hr').borderTopWidth,
        codeBorder: getComputedStyle(code).borderTopWidth,
        codeBackground: getComputedStyle(code).backgroundColor,
        codeText: getComputedStyle(code).color,
      };
    });
    expect(layout.firstMargin).toBe('0px');
    expect(layout.h5Size).toBeGreaterThanOrEqual(layout.bodySize);
    expect(layout.h6Size).toBeGreaterThanOrEqual(layout.bodySize);
    expect(layout.width).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.quoteStart).toBe('0px');
    expect(layout.quoteEnd).toBe('0px');
    expect(Math.abs(layout.tableWidth - layout.tableContainerWidth)).toBeLessThanOrEqual(1);
    expect(layout.align).toEqual(['left', 'left', 'center', 'right']);
    expect(layout.hrStyle).toBe('solid');
    expect(parseFloat(layout.hrWidth)).toBeGreaterThan(0);
    expect(parseFloat(layout.codeBorder)).toBeGreaterThan(0);
    expect(layout.codeBackground).not.toBe(layout.codeText);
    await expect(page.locator('.fivo-viewer')).toHaveAttribute('data-theme', theme);
  });
}

test('Markdown 行内小图不放大，独立图片按比例显示，失败资源有明确提示', async ({ page }) => {
  await page.goto(server.url + '/text-formats.html');
  await page.getByRole('button', { name: 'Markdown 排版', exact: true }).click();
  const article = page.locator('.fivo-markdown-article');
  const image = (caption) => article.locator('.fivo-markdown-image-holder')
    .filter({ has: page.locator(`img[alt="${caption}"]`) });
  for (const caption of ['行内图标', '独立图片', '缺少基址', '损坏图片']) {
    const holder = image(caption);
    await holder.scrollIntoViewIfNeeded();
    await expect(holder).toHaveAttribute('data-state',
      caption === '行内图标' || caption === '独立图片' ? 'ready' : 'unavailable');
  }
  const icon = await image('行内图标').locator('img').boundingBox();
  expect(icon.width).toBeCloseTo(12, 0);
  expect(icon.height).toBeCloseTo(12, 0);
  expect(await image('行内图标').evaluate((element) => getComputedStyle(element).display))
    .toBe('inline-block');
  const picture = await image('独立图片').locator('img').boundingBox();
  expect(picture.width / picture.height).toBeCloseTo(2, 1);
  expect(picture.width).toBeLessThanOrEqual(await page.locator('.fivo-markdown-scroll')
    .evaluate((element) => element.clientWidth));
  for (const caption of ['缺少基址', '损坏图片'])
    await expect(image(caption).locator('[role="status"]')).toHaveText('图片不可用：' + caption);
  const unsafe = article.getByRole('link', { name: /不可用链接/ });
  await expect(unsafe).not.toHaveAttribute('href');
  await expect(unsafe).toHaveAttribute('aria-disabled', 'true');
  await expect(unsafe).toContainText('链接不可用');
  await expect(article.getByRole('link', { name: /无效章节/ }))
    .toContainText('目标章节不存在');
});
