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
test('PDF 连续阅读、跳页和千页窗口保持有界 DOM', async ({ page }) => {
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'long', exact: true }).click();
  const viewport = page.locator('.filumo-pdf-viewport');
  await expect(viewport).toBeVisible();
  await expect
    .poll(() => page.locator('.filumo-pdf-canvas').count())
    .toBeGreaterThan(0);
  await viewport.evaluate((node) => {
    node.scrollTop = node.scrollHeight - node.clientHeight;
  });
  await expect(page.locator('[data-pdf-page="1000"]')).toBeVisible();
  expect(await page.locator('.filumo-pdf-page').count()).toBeLessThan(20);
  const sizes = await page
    .locator('.filumo-pdf-canvas')
    .evaluateAll((nodes) => nodes.map((node) => node.width * node.height));
  expect(sizes.every((size) => size <= 8388608)).toBe(true);
  await page.evaluate(() =>
    window.filumoImagePdf.getCapabilities().navigation.goTo(499),
  );
  await expect(page.locator('[data-pdf-page="500"]')).toBeVisible();
});
test('PDF 正文同页和跨页滚动更新大纲，自动展开祖先并滚入侧栏可见范围', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(server.url + '/image-pdf.html');
  await page
    .getByRole('button', { name: 'reading-outline', exact: true })
    .click();
  const viewport = page.locator('.filumo-pdf-viewport'),
    sidebar = page.locator('.filumo-pdf-sidebar'),
    tree = sidebar.getByRole('tree');
  await expect(
    page.locator('[data-pdf-page="1"] .filumo-pdf-canvas'),
  ).toBeVisible();
  const chapter = tree.getByRole('treeitem', {
    name: 'Chapter 1',
    exact: true,
  });
  await expect(chapter).toHaveAttribute('aria-selected', 'true');
  const scroll = async (index, ratio) => {
    await viewport.evaluate(
      (node, value) => {
        node.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
        // 夹具页面等高；使用当前布局尺寸，覆盖侧栏折叠后的适应宽度缩放。
        const total = parseFloat(
          node.querySelector('.filumo-pdf-pages').style.height,
        );
        const height = (total - 16 * 25) / 24;
        node.scrollTop =
          16 + value.index * (height + 16) + value.ratio * height;
      },
      { index, ratio },
    );
  };
  await chapter
    .getByRole('button', { name: '收起 Chapter 1', exact: true })
    .click();
  await scroll(0, 0.7);
  await expect(chapter).toHaveAttribute('aria-expanded', 'true');
  await expect(
    tree.getByRole('treeitem', { name: 'Section 1', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.filumoImagePdf.getCapabilities().navigation.index,
      ),
    )
    .toBe(0);
  // 新章节尚未到达阅读线时继续选中上一节，不先跳到当前页第一个目录。
  await scroll(14, 0);
  await expect(
    tree.getByRole('treeitem', { name: 'Section 14', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await scroll(14, 0.7);
  const selected = tree.getByRole('treeitem', {
    name: 'Section 15',
    exact: true,
  });
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(() =>
      selected.evaluate((node) => {
        const row = node.getBoundingClientRect(),
          bounds = node.closest('[role="tree"]').getBoundingClientRect();
        return row.top >= bounds.top && row.bottom <= bounds.bottom + 1;
      }),
    )
    .toBe(true);
  expect(await tree.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await scroll(14, 0);
  await expect(
    tree.getByRole('treeitem', { name: 'Section 14', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await scroll(14, 0.7);
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await sidebar.getByRole('button', { name: '收起导航', exact: true }).click();
  await scroll(19, 0.7);
  await sidebar.getByRole('button', { name: '展开导航', exact: true }).click();
  await expect(
    tree.getByRole('treeitem', { name: 'Section 20', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await sidebar.getByRole('tab', { name: '查找', exact: true }).click();
  await scroll(20, 0.7);
  await sidebar.getByRole('tab', { name: '大纲', exact: true }).click();
  await expect(
    tree.getByRole('treeitem', { name: 'Section 21', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('PDF 左侧 Tab 保留导航状态，工具栏保留大纲和查找入口', async ({
  page,
}) => {
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'pdf', exact: true }).click();
  await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible();
  await expect(page.locator('[data-pdf-page="1"] .textLayer')).toContainText(
    'Filumo PDF page 1',
  );
  await expect(
    page.locator('[data-pdf-page="1"] .filumo-pdf-page-status'),
  ).toBeEmpty();
  const toolbar = page.getByRole('toolbar', { name: '文档工具栏' }),
    sidebar = page.locator('.filumo-pdf-sidebar');
  await expect(
    toolbar.getByRole('button', { name: '大纲', exact: true }),
  ).toBeVisible();
  await expect(
    toolbar.getByRole('button', { name: '查找', exact: true }),
  ).toBeVisible();
  await expect(
    toolbar.locator('[data-filumo-action="pdf.thumbnails"]'),
  ).toHaveCount(0);
  for (const name of ['大纲', '缩略图', '查找'])
    await expect(sidebar.getByRole('tab', { name, exact: true })).toBeVisible();
  await page.evaluate(() =>
    window.filumoImagePdf.getCapabilities().search.setQuery('FILUMO_TARGET_12'),
  );
  await expect(page.locator('[data-pdf-page="12"]')).toBeVisible();
  await expect
    .poll(() => page.locator('.filumo-pdf-highlight').count())
    .toBeGreaterThan(0);
  await sidebar.getByRole('tab', { name: '缩略图', exact: true }).click();
  await expect(page.locator('.filumo-pdf-thumbnails')).toBeVisible();
  expect(await page.locator('.filumo-pdf-thumbnail').count()).toBeLessThan(10);
  await page.evaluate(() =>
    window.filumoImagePdf.getCapabilities().navigation.goTo(3),
  );
  await sidebar.getByRole('tab', { name: '查找', exact: true }).click();
  await expect(sidebar.getByLabel('查找 PDF')).toHaveValue('FILUMO_TARGET_12');
  expect(
    await page.evaluate(
      () => window.filumoImagePdf.getCapabilities().navigation.index,
    ),
  ).toBe(3);
  await sidebar.locator('.filumo-pdf-search-result').first().click();
  await expect(page.locator('[data-pdf-page="12"]')).toBeVisible();
  await toolbar.getByRole('button', { name: '大纲', exact: true }).click();
  await expect(
    sidebar.getByRole('tab', { name: '大纲', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await toolbar.getByRole('button', { name: '大纲', exact: true }).click();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await toolbar.getByRole('button', { name: '查找', exact: true }).click();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
  await expect(sidebar.getByLabel('查找 PDF')).toBeFocused();
});

test('PDF 查找上下箭头完整可辨，空查询禁用且有结果后仍可逐项定位', async ({
  page,
}) => {
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'pdf', exact: true }).click();
  await page
    .locator('.filumo-pdf-sidebar')
    .getByRole('tab', { name: '查找', exact: true })
    .click();
  const panel = page.locator('.filumo-pdf-search'),
    previous = panel.getByRole('button', { name: '上一项', exact: true }),
    next = panel.getByRole('button', { name: '下一项', exact: true });
  for (const button of [previous, next]) {
    await expect(button).toBeDisabled();
    await expect(button).toHaveCSS('width', '28px');
    await expect(button).toHaveCSS('height', '28px');
    const svg = button.locator('svg');
    await expect(svg).toBeVisible();
    await expect(svg).toHaveCSS('width', '16px');
    await expect(svg).toHaveCSS('height', '16px');
    const geometry = await svg.evaluate((node) => {
      const box = node.querySelector('path').getBBox(),
        view = node.viewBox.baseVal;
      return {
        width: box.width,
        height: box.height,
        inside:
          box.x >= view.x &&
          box.y >= view.y &&
          box.x + box.width <= view.x + view.width &&
          box.y + box.height <= view.y + view.height,
      };
    });
    expect(geometry.width).toBeGreaterThanOrEqual(10);
    expect(geometry.height).toBeGreaterThanOrEqual(16);
    expect(geometry.inside).toBe(true);
    expect(
      await button.evaluate((node) => Number(getComputedStyle(node).opacity)),
    ).toBeGreaterThanOrEqual(0.6);
  }
  await page.evaluate(() =>
    window.filumoImagePdf.getCapabilities().search.setQuery('FILUMO_TARGET_'),
  );
  await expect(next).toBeEnabled();
  await next.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.filumoImagePdf.getCapabilities().search.currentIndex,
      ),
    )
    .toBe(1);
  await previous.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.filumoImagePdf.getCapabilities().search.currentIndex,
      ),
    )
    .toBe(0);
});

test('PDF 主栏按阅读、翻页和视图排序，窄窗口也能直接旋转', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'pdf', exact: true }).click();
  const toolbar = page.getByRole('toolbar', { name: '文档工具栏' }),
    rotate = toolbar.getByRole('button', { name: '旋转', exact: true });
  await expect(rotate).toBeVisible();
  await expect(toolbar.locator('.filumo-toolbar-more')).toBeHidden();
  expect(
    await toolbar
      .locator('.filumo-controls-main > *')
      .evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            node.dataset.filumoAction ??
            (node.classList.contains('filumo-navigation-control')
              ? 'navigation'
              : 'zoom'),
        ),
      ),
  ).toEqual(['pdf.outline', 'pdf.search', 'navigation', 'zoom', 'pdf.rotate']);
  const first = page.locator('[data-pdf-page="1"]');
  await expect(first).toBeVisible();
  const height = await first.evaluate((node) => node.clientHeight);
  await rotate.click();
  await expect
    .poll(() => first.evaluate((node) => node.clientHeight))
    .not.toBe(height);
  await page.setViewportSize({ width: 640, height: 800 });
  await expect(rotate).toBeVisible();
  await expect
    .poll(() =>
      rotate.evaluate((node) => {
        const button = node.getBoundingClientRect(),
          bounds = node.closest('.filumo-toolbar').getBoundingClientRect();
        return button.left >= bounds.left && button.right <= bounds.right;
      }),
    )
    .toBe(true);
});

test('PDF 多级大纲使用公共树线，同页书签选择和 Tab 切换保持稳定', async ({
  page,
}) => {
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'outline', exact: true }).click();
  const sidebar = page.locator('.filumo-pdf-sidebar'),
    tree = sidebar.getByRole('tree');
  const first = tree.getByRole('treeitem', { name: 'First page', exact: true });
  const one = tree.getByRole('treeitem', {
    name: 'Same page one',
    exact: true,
  });
  const two = tree.getByRole('treeitem', {
    name: 'Same page two',
    exact: true,
  });
  const nested = tree.getByRole('treeitem', {
    name: 'Nested section',
    exact: true,
  });
  await expect(nested).toHaveAttribute('aria-level', '3');
  await expect(nested.locator('.filumo-outline-guide')).toHaveCount(2);
  await expect(two.locator('.filumo-outline-branch')).toHaveAttribute(
    'data-continues',
    'false',
  );
  await expect(first).toHaveCSS('height', '28px');
  await expect(one.locator('.filumo-outline-label')).toHaveCSS(
    'font-size',
    '14px',
  );
  await one.click();
  await two.click();
  await expect(two).toHaveAttribute('aria-selected', 'true');
  await sidebar.getByRole('tab', { name: '查找', exact: true }).click();
  await sidebar.getByRole('tab', { name: '大纲', exact: true }).click();
  await expect(two).toHaveAttribute('aria-selected', 'true');
  await first
    .getByRole('button', { name: '收起 First page', exact: true })
    .click();
  await expect(one).toHaveCount(0);
  await first.press('ArrowRight');
  await first.press('ArrowRight');
  await expect(one).toBeFocused();
});

test('两个 PDF 共存时销毁一个仍保留另一个的公共树样式', async ({ page }) => {
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'outline', exact: true }).click();
  await page.evaluate(() => window.filumoImagePdf.addSibling());
  const sibling = page.locator('#image-pdf-sibling');
  const leaf = sibling.getByRole('treeitem', {
    name: 'Same page two',
    exact: true,
  });
  await expect(leaf).toBeVisible();
  await page.evaluate(() => window.filumoImagePdf.dispose());
  await expect(leaf.locator('.filumo-outline-label')).toHaveCSS(
    'font-size',
    '14px',
  );
  expect(
    await leaf
      .locator('.filumo-outline-branch')
      .evaluate((node) => getComputedStyle(node, '::after').height),
  ).toBe('1px');
  await page.evaluate(() => window.filumoImagePdf.disposeSibling());
  await expect(page.locator('.filumo-outline-tree')).toHaveCount(0);
});
test('PDF 混合页缩放、停用恢复及销毁释放当前页面', async ({ page }) => {
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'mixed', exact: true }).click();
  await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible();
  await page.evaluate(async () => {
    await window.filumoImagePdf.getCapabilities().navigation.goTo(5);
    await window.filumoImagePdf.getCapabilities().zoom.set(125);
  });
  await expect(page.locator('[data-pdf-page="6"]')).toBeVisible();
  await page.evaluate(() => {
    window.filumoImagePdf.setActive(false);
    window.filumoImagePdf.setActive(true);
  });
  await expect(page.locator('.filumo-pdf-viewport')).toBeVisible();
  await page.evaluate(() => window.filumoImagePdf.dispose());
  await expect(page.locator('.filumo-viewer')).toHaveCount(0);
  await expect(page.locator('style[data-filumo-style^="pdf:"]')).toHaveCount(0);
});

test('真实密码 PDF 在同一会话重试，纯图片页查找不产生伪结果', async ({
  page,
}) => {
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'password', exact: true }).click();
  await page.getByLabel('PDF 密码').fill('wrong');
  await page.getByRole('button', { name: '打开 PDF', exact: true }).click();
  await expect(
    page.getByText('密码不正确，请重试', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('PDF 密码').fill('fixture');
  await page.getByRole('button', { name: '打开 PDF', exact: true }).click();
  await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'scan', exact: true }).click();
  await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible();
  await expect(
    page.getByRole('tab', { name: '缩略图', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() =>
    window.filumoImagePdf.getCapabilities().search.setQuery('Filumo'),
  );
  await expect(page.locator('.filumo-pdf-search output')).toHaveText('未找到');
});

test('私有 PDF 保留来源鉴权并使用 206，全文服务仅消费一次 200', async ({
  page,
}) => {
  const responses = [];
  page.on('response', (response) => {
    if (/pdf-(private|full)\.pdf/.test(response.url()))
      responses.push({
        url: response.url(),
        status: response.status(),
        headers: response.request().headers(),
      });
  });
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'private', exact: true }).click();
  await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible();
  await page.evaluate(() =>
    window.filumoImagePdf.getCapabilities().navigation.goTo(999),
  );
  expect(responses.some((item) => item.status === 206)).toBe(true);
  expect(
    responses
      .filter((item) => item.url.includes('pdf-private'))
      .every((item) => item.headers['x-filumo-fixture'] === 'allowed'),
  ).toBe(true);
  await page.getByRole('button', { name: 'full', exact: true }).click();
  await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible();
  expect(
    responses.filter(
      (item) => item.url.includes('pdf-full') && item.status === 200,
    ),
  ).toHaveLength(1);
});

test('PDF 反复打开及销毁不留下实际 Worker 或视图样式', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker,
      live = new Set();
    window.filumoLiveWorkers = live;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        live.add(this);
      }
      terminate() {
        live.delete(this);
        super.terminate();
      }
    };
  });
  await page.goto(server.url + '/image-pdf.html');
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'pdf', exact: true }).click();
    await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible();
    await page.evaluate(() => window.filumoImagePdf.dispose());
    expect(await page.evaluate(() => window.filumoLiveWorkers.size)).toBe(0);
    await expect(page.locator('style[data-filumo-style^="pdf:"]')).toHaveCount(0);
  }
});
