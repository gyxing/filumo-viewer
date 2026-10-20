import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { isolateNetwork, startServer } from '../helpers.mjs';
let server;
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-format-check.mjs');
});
test.afterAll(async () => {
  await server?.close();
});

/** 完整外壳回归独立于正文快照，防止工具栏被关闭后漏掉 UI 退步。 */
async function preview(page, format = 'docx', extra = '') {
  await isolateNetwork(page);
  await page.goto(
    server.url + '/?ui=1&sample=basic-' + format + '&format=' + format + extra,
  );
  await page.locator('#run').click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-state',
    extra.includes('empty') ? 'idle' : 'ready',
  );
}

/** 宽屏编辑主栏组合框，窄屏通过纯菜单选择同一缩放能力。 */
async function chooseToolbarZoom(page, choice, en = false) {
  const toolbar = page.locator('.fivo-toolbar');
  const input = toolbar.getByRole('combobox', {
    name: en ? 'Zoom percentage' : '缩放比例',
    exact: true,
  });
  if (await input.isVisible()) {
    if (typeof choice === 'number') {
      await input.fill(String(choice));
      await input.press('Enter');
      await expect(input).toHaveValue(String(choice));
    } else {
      await input.click();
      await page.getByRole('option', { name: choice, exact: true }).click();
    }
    return;
  }
  const more = toolbar.getByRole('button', {
    name: en ? 'More actions' : '更多操作',
    exact: true,
  });
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await page
    .getByRole('menuitem', { name: en ? 'Zoom' : '缩放', exact: true })
    .click();
  await page
    .getByRole('menuitemradio', {
      name: typeof choice === 'number' ? choice + '%' : choice,
      exact: true,
    })
    .click();
  if (typeof choice === 'number')
    await expect(
      toolbar.locator(
        '[data-fivo-menu-action="toolbar.zoom"] .fivo-menu-value',
      ),
    ).toHaveText(choice + '%');
}

/** 查找可能位于主栏或收纳菜单，两种入口都必须把焦点交给正文。 */
async function openToolbarSearch(page, en = false) {
  const search = page.locator(
    '.fivo-controls-main [data-fivo-action="office.search"]',
  );
  if (await search.isVisible()) return search.click();
  const more = page.getByRole('button', {
    name: en ? 'More actions' : '更多操作',
    exact: true,
  });
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await page
    .getByRole('menuitem', { name: en ? 'Find' : '查找', exact: true })
    .click();
}

for (const format of ['docx', 'xlsx', 'pptx']) {
  test('取消滚动气泡后仍可自适应缩放：' + format, async ({ page }) => {
    await preview(page, format, '&width=320');
    await chooseToolbarZoom(page, 300);
    const viewport = page
      .locator('[data-office-overflow-viewport="true"]')
      .first();
    await expect
      .poll(() =>
        viewport.evaluate(
          (el) =>
            el.scrollWidth > el.clientWidth + 2 ||
            el.scrollHeight > el.clientHeight + 2,
        ),
      )
      .toBe(true);
    expect(await page.locator('.office-file-overflow-notice').count()).toBe(0);
    await chooseToolbarZoom(page, '适应宽度');
    // 极窄的 PPT 视口可能触及已有的 25% 下限，此时允许保留正常滚动。
    if (format !== 'pptx')
      await expect
        .poll(() =>
          viewport.evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
        )
        .toBe(true);
    await chooseToolbarZoom(page, 125);
    await expect(page.locator('.office-file-overflow-notice')).toHaveCount(0);
  });
}

for (const width of [320, 760, 1100])
  test(
    'UI 对齐：工具栏 ' + width + 'px 保持紧凑且支持缩放操作',
    async ({ page }, info) => {
      await preview(page, 'docx', '&width=' + width);
      const toolbar = page.locator('.fivo-toolbar');
      expect((await toolbar.boundingBox()).height).toBeLessThanOrEqual(56);
      await expect(toolbar).toHaveAttribute('role', 'toolbar');
      expect(
        await toolbar.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      await expect(
        toolbar.getByRole('button', { name: '打开文件', exact: true }),
      ).toBeVisible();
      expect(await toolbar.locator('svg').count()).toBeGreaterThan(3);
      if (width === 1100)
        await toolbar.screenshot({ path: 'tmp/toolbar-word-real.png' });
      if (width === 320)
        await toolbar.screenshot({ path: 'tmp/toolbar-narrow-real.png' });
      await chooseToolbarZoom(page, 125);
      const more = toolbar.getByRole('button', {
        name: '更多操作',
        exact: true,
      });
      if (await more.isVisible()) {
        await more.click();
        const menu = page.getByRole('menu', { name: '更多操作', exact: true });
        await expect(
          menu.locator('input, select, [role="combobox"]'),
        ).toHaveCount(0);
        const bounds = await menu.boundingBox();
        const bar = await toolbar.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(bar.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(bar.x + bar.width);
      }
      await info.attach('toolbar-' + width, {
        body: await page.locator('#preview').screenshot(),
        contentType: 'image/png',
      });
    },
  );

test('UI 对齐：查找面板排版、高亮、选项与大纲切换', async ({ page }, info) => {
  await preview(page);
  await page.locator('[data-fivo-action="office.search"]').click();
  const query = page.locator('.fivo-native-query input[type="search"]');
  const panel = page.locator('.fivo-native-panel').filter({ has: query });
  await expect(panel.locator('.fivo-native-search-empty')).toHaveText(
    '输入文字以查找当前文档',
  );
  const field = panel.locator('.fivo-native-query-field');
  expect((await field.boundingBox()).height).toBe(36);
  expect((await field.boundingBox()).width).toBeGreaterThan(
    (await panel.boundingBox()).width - 32,
  );
  expect((await query.boundingBox()).width).toBeGreaterThanOrEqual(120);
  await query.fill('Fivo');
  await expect(page.locator('.fivo-native-result')).toHaveCount(2);
  await expect(panel.locator('.fivo-native-search-position')).toHaveText(
    '2 个结果',
  );
  await expect(panel.locator('header .fivo-native-count')).toHaveCount(0);
  await expect(panel.locator('.fivo-native-result mark')).toHaveCount(2);
  expect(
    (await panel.locator('.fivo-native-result').first().boundingBox()).height,
  ).toBe(68);
  await expect(page.locator('.fivo-native-result').first()).toContainText(
    '第 1 页',
  );
  await query.press('Enter');
  await expect(panel.locator('.fivo-native-search-position')).toHaveText(
    '1 / 2',
  );
  await query.press('Shift+Enter');
  await expect(panel.locator('.fivo-native-search-position')).toHaveText(
    '2 / 2',
  );
  await panel.screenshot({ path: 'tmp/search-refined-light.png' });
  await query.fill('fivo');
  await panel.getByLabel('区分大小写', { exact: true }).check();
  await expect(panel.locator('.fivo-native-search-empty')).toHaveText(
    '未找到匹配内容',
  );
  await panel.getByLabel('区分大小写', { exact: true }).uncheck();
  await expect(panel.locator('.fivo-native-result')).toHaveCount(2);
  await query.fill('Fiv');
  await panel.getByLabel('全字匹配', { exact: true }).check();
  await expect(panel.locator('.fivo-native-search-empty')).toHaveText(
    '未找到匹配内容',
  );
  await panel.getByLabel('全字匹配', { exact: true }).uncheck();
  await query.fill('Fivo');
  await expect(panel.locator('.fivo-native-result')).toHaveCount(2);
  await panel.evaluate((el) => {
    el.style.flexBasis = '190px';
  });
  expect(
    await panel.evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await panel.screenshot({ path: 'tmp/search-refined-narrow.png' });
  await panel.evaluate((el) => {
    el.style.flexBasis = '';
  });
  await info.attach('search', {
    body: await page.locator('#preview').screenshot(),
    contentType: 'image/png',
  });
  await page
    .locator('.fivo-native-panel')
    .filter({ has: query })
    .getByRole('button', { name: '大纲', exact: true })
    .click();
  await expect(page.locator('.fivo-native-word-outline')).toBeVisible();
  await expect(page.getByRole('treeitem').first()).toContainText(
    'Fivo heading',
  );
});

test('UI 对齐：短表格补满网格且批注按钮不挤压', async ({ page }, info) => {
  await preview(page, 'xlsx');
  await page
    .locator('.fivo-toolbar')
    .screenshot({ path: 'tmp/toolbar-excel-real.png' });
  expect(
    await page.locator('[data-office-spreadsheet-cell="H10"]').count(),
  ).toBe(1);
  await page.locator('[data-fivo-action="office.review"]').click();
  const review = page.locator('.fivo-native-panel').filter({
    has: page.getByRole('button', { name: '上一条批注', exact: true }),
  });
  await expect(review).toBeVisible();
  expect(await review.locator('header svg').count()).toBe(3);
  await expect(review.locator('.fivo-native-result').first()).toContainText(
    'A1',
  );
  await info.attach('spreadsheet-review', {
    body: await page.locator('#preview').screenshot(),
    contentType: 'image/png',
  });
});

test('UI 对齐：幻灯片缩略图卡片与备注把手', async ({ page }, info) => {
  await preview(page, 'pptx');
  await page
    .locator('.fivo-toolbar')
    .screenshot({ path: 'tmp/toolbar-ppt-real.png' });
  const cards = page.locator('.office-file-pptx-viewer__thumbnail-button');
  await expect(cards).toHaveCount(2);
  const border = await cards
    .nth(1)
    .evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(parseFloat(border)).toBeGreaterThan(0);
  await expect(cards.nth(1)).toContainText('第 2 页');
  await page.locator('[data-fivo-action="office.notes"]').click();
  await expect(
    page.getByText('Fivo speaker notes', { exact: true }),
  ).toBeVisible();
  await info.attach('presentation-notes', {
    body: await page.locator('#preview').screenshot(),
    contentType: 'image/png',
  });
});

test('UI 对齐：空态提供文件入口，错误保留中文引导', async ({ page }, info) => {
  await preview(page, 'docx', '&empty=1&theme=dark');
  await expect(page.locator('.fivo-status')).toContainText(
    '请选择文档进行预览',
  );
  expect(await page.locator('.fivo-status svg').count()).toBeGreaterThan(0);
  await info.attach('empty-dark', {
    body: await page.locator('#preview').screenshot(),
    contentType: 'image/png',
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.docx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('invalid-office-file'),
  });
  await expect(page.locator('.fivo-status')).toContainText('预览失败');
  await expect(page.locator('.fivo-status')).toContainText(
    '请确认文件格式正确且文件未损坏',
  );
});

/** 在既有公开 DOCX 中加入合成图片，不依赖本机业务文档。 */
async function imageDocument() {
  const { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } =
    await import(
      new URL(
        '../../../packages/office/node_modules/@zip.js/zip.js/lib/zip-core-native.js',
        import.meta.url,
      ).href
    );
  const input = new ZipReader(
    new Uint8ArrayReader(
      await readFile('tests/fixtures/public/generated/sample.docx'),
    ),
    { useWebWorkers: false },
  );
  const entries = new Map();
  for (const entry of await input.getEntries())
    if (!entry.directory)
      entries.set(entry.filename, await entry.getData(new Uint8ArrayWriter()));
  await input.close();
  const replace = (name, from, to) =>
    entries.set(
      name,
      Buffer.from(
        Buffer.from(entries.get(name)).toString('utf8').replace(from, to),
      ),
    );
  replace(
    '[Content_Types].xml',
    '</Types>',
    '<Default Extension="svg" ContentType="image/svg+xml"/></Types>',
  );
  replace(
    'word/_rels/document.xml.rels',
    '</Relationships>',
    '<Relationship Id="fivoImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fivo.svg"/></Relationships>',
  );
  replace(
    'word/document.xml',
    '<w:sectPr>',
    '<w:p><w:r><w:drawing xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><wp:inline><wp:extent cx="2286000" cy="1143000"/><wp:docPr id="8" name="Fivo test picture"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="8" name="Fivo test picture"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="fivoImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2286000" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr>',
  );
  entries.set(
    'word/media/fivo.svg',
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" rx="12" fill="#dbeafe"/><circle cx="50" cy="60" r="28" fill="#1677ff"/><text x="96" y="68" font-family="Arial" font-size="22" fill="#243247">Fivo image</text></svg>',
    ),
  );
  const output = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  for (const [name, data] of entries)
    await output.add(name, new Uint8ArrayReader(data), { level: 0 });
  return Buffer.from(await output.close());
}

/** 源码和真实构建共用弹层断言，样式必须实际匹配，不能只验证 DOM 存在。 */
async function checkImagePreview(page, info, name) {
  const viewer = page.locator('.fivo-viewer');
  await viewer.locator('input[type="file"]').setInputFiles({
    name: 'image.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await imageDocument(),
  });
  const image = viewer
    .locator('.office-file-docx-viewer__scroller img')
    .first();
  await expect(image).toBeVisible();
  const childrenBefore = await viewer.locator(':scope > *').count();
  const stylesBefore = await page.locator('style[data-fivo-style]').count();
  await image.dblclick();
  const overlay = viewer.locator('.fivo-image-preview');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('position', 'absolute', { timeout: 3000 });
  await expect(overlay).toHaveCSS('display', 'flex');
  await expect(overlay).toHaveCSS('background-color', 'rgba(32, 34, 38, 0.78)');
  const controls = overlay.locator('.fivo-image-preview-controls');
  await expect(controls).toHaveCSS('display', 'flex');
  await expect(
    controls.getByRole('button', { name: '关闭', exact: true }),
  ).toHaveCSS('height', '32px');
  const root = await viewer.boundingBox();
  const rect = await overlay.boundingBox();
  expect(Math.abs(root.height - rect.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(root.width - rect.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(root.y - rect.y)).toBeLessThanOrEqual(1);
  await expect(overlay.locator('.fivo-image-preview-title')).toHaveText(
    'Fivo test picture.png',
  );
  expect(await overlay.locator('button svg').count()).toBeGreaterThanOrEqual(6);
  await expect(
    overlay.getByRole('button', { name: '关闭', exact: true }),
  ).toBeFocused();
  const previewImage = overlay.locator('.fivo-image-surface > img');
  await expect(previewImage).toBeVisible();
  await previewImage.click();
  await expect(overlay).toBeVisible();
  const picture = await previewImage.boundingBox();
  const beforeDrag = await previewImage.getAttribute('style');
  await page.mouse.move(
    picture.x + picture.width / 2,
    picture.y + picture.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    picture.x + picture.width / 2 + 80,
    picture.y + picture.height / 2 + 40,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(overlay).toBeVisible();
  await expect
    .poll(() => previewImage.getAttribute('style'))
    .not.toBe(beforeDrag);
  // 空白区域也允许平移；移出后返回起点，松手产生的 click 仍不能关闭弹层。
  const viewport = overlay.locator('.fivo-image-preview-viewport');
  const area = await viewport.boundingBox();
  await page.mouse.move(area.x + 6, area.y + 6);
  await page.mouse.down();
  await page.mouse.move(area.x + 36, area.y + 6, { steps: 4 });
  await page.mouse.move(area.x + 6, area.y + 6, { steps: 4 });
  await page.mouse.up();
  await expect(overlay).toBeVisible();
  await controls.getByRole('button', { name: '复位', exact: true }).click();
  await expect.poll(() => previewImage.getAttribute('style')).toBe(beforeDrag);
  await info.attach(name, {
    body: await viewer.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(viewer.locator(':scope > *')).toHaveCount(childrenBefore);
  await expect(viewer.locator(':scope > [inert]')).toHaveCount(0);
  await expect(image).toBeFocused();
  // 再次打开并用按钮关闭，确保作用域容器和资源租约不会累积。
  await image.dblclick();
  await overlay.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(overlay).toHaveCount(0);
  // 正常点击空白仍能关闭，避免通过禁用蒙层交互掩盖拖动误关闭。
  await image.dblclick();
  await expect(overlay.locator('.fivo-image-surface > img')).toBeVisible();
  await overlay
    .locator('.fivo-image-preview-viewport')
    .click({ position: { x: 6, y: 6 } });
  await expect(overlay).toHaveCount(0);
  await expect(viewer.locator(':scope > *')).toHaveCount(childrenBefore);
  await expect(page.locator('style[data-fivo-style]')).toHaveCount(
    stylesBefore,
  );
}

test('UI 对齐：图片弹层覆盖整个预览器并保留标题和焦点', async ({
  page,
}, info) => {
  await preview(page, 'docx', '&empty=1');
  await checkImagePreview(page, info, 'image-preview');
});

test('UI 对齐：空白补齐不额外产生滚动条', async ({ page }) => {
  await preview(page, 'xlsx');
  const grid = page.locator('.office-file-xlsx-virtual-grid');
  const overflow = await grid.evaluate((el) => ({
    x: el.scrollWidth - el.clientWidth,
    y: el.scrollHeight - el.clientHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);
});

test('UI 对齐：深色英文查找、缩放边界及销毁', async ({ page }, info) => {
  await preview(page, 'docx', '&theme=dark&locale=en-US&width=760');
  const toolbar = page.locator('.fivo-toolbar');
  const zoom = toolbar.getByRole('combobox', {
    name: 'Zoom percentage',
    exact: true,
  });
  await chooseToolbarZoom(page, 'Fit width', true);
  await page
    .locator('.fivo-viewer')
    .screenshot({ path: 'tmp/toolbar-zoom-dark-real.png' });
  if (await zoom.isVisible()) {
    await zoom.fill('0');
    await zoom.press('Enter');
    await expect(zoom).toHaveValue('25');
  } else await chooseToolbarZoom(page, 25, true);
  await page.keyboard.press('Escape');
  await openToolbarSearch(page, true);
  await page.keyboard.press('Escape');
  // 关闭更多面板后重新打开查找，确保 Escape 没有意外丢失控件状态。
  if (!(await page.locator('.fivo-native-query').isVisible()))
    await openToolbarSearch(page, true);
  const input = page.locator('.fivo-native-query input');
  await input.fill('Fivo');
  await expect(page.locator('.fivo-native-result')).toHaveCount(2);
  await page
    .locator('.fivo-native-panel')
    .filter({ has: input })
    .screenshot({ path: 'tmp/search-refined-dark.png' });
  await info.attach('search-dark', {
    body: await page.locator('#preview').screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(input).toHaveValue('');
  await page.locator('#destroy').click();
  await expect(page.locator('body')).toHaveAttribute('data-state', 'destroyed');
  await expect(page.locator('.fivo-viewer')).toHaveCount(0);
});

for (const framework of ['vanilla', 'react', 'vue3', 'vue2'])
  test(
    'UI 构建产物：' + framework + ' 自动样式及生命周期',
    async ({ page }, info) => {
      const demo = await startServer('scripts/testing/serve-demo.mjs', [
        '--framework',
        framework,
        '--port',
        '0',
      ]);
      try {
        await isolateNetwork(page);
        await page.goto(demo.url);
        await page.locator('#docx').click();
        await expect(page.locator('body')).toHaveAttribute(
          'data-state',
          'ready',
        );
        const toolbar = page.getByRole('toolbar', { name: '文档工具栏' });
        expect((await toolbar.boundingBox()).height).toBeLessThanOrEqual(56);
        expect(await toolbar.locator('svg').count()).toBeGreaterThan(3);
        expect(
          await page.locator('style[data-fivo-style]').count(),
        ).toBeGreaterThan(0);
        await info.attach(framework + '-built-ui', {
          body: await page.locator('.fivo-viewer').screenshot(),
          contentType: 'image/png',
        });
        await checkImagePreview(page, info, framework + '-built-image-preview');
        // 文档切换时也必须回收仍打开的弹层及其作用域容器。
        await page
          .locator('.office-file-docx-viewer__scroller img')
          .first()
          .dblclick();
        await page.locator('#verify').click();
        await expect(page.locator('body')).toHaveAttribute(
          'data-verification',
          'passed',
        );
        await expect(page.locator('.fivo-image-preview')).toHaveCount(0);
        await expect(page.locator('style[data-fivo-style]')).toHaveCount(0);
      } finally {
        await demo.close();
      }
    },
  );
