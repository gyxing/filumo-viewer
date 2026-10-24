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

test('短文件行号底色铺满阅读区，换行、缩放和横向滚动保持栏宽对齐', async ({
  page,
}) => {
  await page.goto(server.url + '/text-expansion.html');
  await page.getByRole('button', { name: 'code-html', exact: true }).click();
  await page.locator('.filumo-viewer').evaluate((element) => {
    element.style.width = '340px';
  });
  const viewport = page.locator('.filumo-text-viewport'),
    canvas = viewport.locator('.filumo-text-canvas');
  await expect(
    viewport.locator('.filumo-text-line-number').first(),
  ).toBeVisible();
  // 画布与视口可能一起缩短，必须同时对照外层阅读区检查顶部和底部。
  await expect
    .poll(() =>
      viewport.evaluate((element) => {
        const body = element.closest('.filumo-reading-body');
        if (!body) return false;
        const area = body.getBoundingClientRect(),
          view = element.getBoundingClientRect();
        return (
          area.height > 0 &&
          Math.abs(view.top - area.top) < 1 &&
          Math.abs(view.bottom - area.bottom) < 1
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      canvas.evaluate(
        (element) => element.clientHeight >= element.parentElement.clientHeight,
      ),
    )
    .toBe(true);
  // 在同一帧扩大容器并读取布局，覆盖 ResizeObserver 尚未同步脚本高度的时机。
  const resized = await page.locator('.filumo-viewer').evaluate((element) => {
    element.style.height = '760px';
    const viewport = element.querySelector('.filumo-text-viewport'),
      canvas = viewport.querySelector('.filumo-text-canvas');
    return {
      viewport: viewport.clientHeight,
      canvas: canvas.clientHeight,
      backdrop: parseFloat(getComputedStyle(canvas, '::before').height),
    };
  });
  expect(resized.canvas).toBeGreaterThanOrEqual(resized.viewport);
  expect(resized.backdrop).toBeGreaterThanOrEqual(resized.viewport);
  const width = await canvas.evaluate((element) =>
    parseFloat(getComputedStyle(element, '::before').width),
  );
  const backdrop = await canvas.evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return {
      display: style.display,
      background: style.backgroundColor,
      border: style.borderRightWidth,
      height: parseFloat(style.height),
    };
  });
  expect(backdrop.display).toBe('block');
  expect(backdrop.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(backdrop.border).toBe('1px');
  expect(
    Math.abs(
      backdrop.height -
        (await canvas.evaluate((element) => element.clientHeight)),
    ),
  ).toBeLessThan(1);
  await expect
    .poll(() =>
      viewport
        .locator('.filumo-text-row')
        .filter({ hasText: '<a href=' })
        .first()
        .evaluate(
          (element) =>
            element.getBoundingClientRect().height >
            parseFloat(getComputedStyle(element).lineHeight),
        ),
    )
    .toBe(true);
  await expect(viewport.locator('.filumo-text-line-number').last()).toHaveText(
    '5',
  );
  await expect(viewport.locator('.filumo-text-filler-number')).toHaveCount(0);
  await page.evaluate(() =>
    window.filumoTextExpansion.update({ zoom: 150, theme: 'dark' }),
  );
  await expect
    .poll(() =>
      canvas.evaluate((element) =>
        parseFloat(getComputedStyle(element, '::before').width),
      ),
    )
    .toBeCloseTo(width * 1.5, 0);
  const number = viewport.locator('.filumo-text-line-number').first();
  expect(
    Math.abs(
      (await number.boundingBox()).width -
        (await canvas.evaluate((element) =>
          parseFloat(getComputedStyle(element, '::before').width),
        )),
    ),
  ).toBeLessThan(1);
  await page.locator('.filumo-toolbar-more-trigger').click();
  await page
    .getByRole('menuitemcheckbox', { name: '自动换行', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      viewport.evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);
  // 横向滚动条占用的高度不能被百分比最小高度再次算入，产生多余纵向滚动。
  expect(
    await viewport.evaluate(
      (element) => element.scrollHeight <= element.clientHeight + 1,
    ),
  ).toBe(true);
  await viewport.evaluate((element) => {
    element.scrollLeft = 30;
  });
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  const positions = await viewport.evaluate((element) => ({
    number: element
      .querySelector('.filumo-text-line-number')
      .getBoundingClientRect().left,
    background: element
      .querySelector('.filumo-text-canvas')
      .getBoundingClientRect().left,
  }));
  expect(Math.abs(positions.number - positions.background)).toBeLessThan(1);
  await page.locator('.filumo-toolbar-more-trigger').click();
  await page
    .getByRole('menuitemcheckbox', { name: '行号', exact: true })
    .click();
  await expect(number).toBeHidden();
  await expect(viewport.locator('.filumo-text-gutter-fill')).toBeHidden();
  await expect
    .poll(() =>
      canvas.evaluate(
        (element) => getComputedStyle(element, '::before').display,
      ),
    )
    .toBe('none');
});

test('空文件、单行文件和十三行文件默认只显示真实行号', async ({ page }) => {
  await page.goto(server.url + '/text-expansion.html');
  const viewport = page.locator('.filumo-text-viewport');
  for (const [name, content, lines] of [
    ['empty.ts', '', 1],
    ['single.py', 'print("hello")', 1],
    ['short.css', Array(13).fill('/* line */').join('\n'), 13],
  ]) {
    await page.locator('.filumo-viewer input[type="file"]').setInputFiles({
      name,
      mimeType: 'text/plain',
      buffer: Buffer.from(content),
    });
    await expect(page.locator('.filumo-title')).toHaveText(name);
    await expect(viewport.locator('.filumo-text-line-number')).toHaveCount(lines);
    const filler = viewport.locator('.filumo-text-gutter-fill');
    await expect(filler).toBeHidden();
    await expect(filler.locator('.filumo-text-filler-number')).toHaveCount(0);
    const layout = await viewport.evaluate((element) => {
      const canvas = element.querySelector('.filumo-text-canvas'),
        area = element.closest('.filumo-reading-body').getBoundingClientRect(),
        view = element.getBoundingClientRect(),
        backdrop = getComputedStyle(canvas, '::before');
      return {
        area: area.height,
        bottomGap: Math.abs(area.bottom - view.bottom),
        viewport: element.clientHeight,
        canvas: canvas.clientHeight,
        backdrop: parseFloat(backdrop.height),
        display: backdrop.display,
        overflows: element.scrollHeight > element.clientHeight + 1,
      };
    });
    expect(layout.area).toBeGreaterThan(0);
    expect(layout.bottomGap).toBeLessThan(1);
    expect(layout.canvas).toBeGreaterThanOrEqual(layout.viewport);
    expect(layout.backdrop).toBeGreaterThanOrEqual(layout.viewport);
    expect(layout.display).toBe('block');
    expect(layout.overflows).toBe(false);
  }
});

test('构建和环境文件按原始文件名进入 Code，语言菜单保持分组', async ({
  page,
}) => {
  await page.goto(server.url + '/text-expansion.html');
  for (const [id, file, language] of [
    ['code-dockerfile', 'Dockerfile.dev', 'dockerfile'],
    ['code-makefile', 'Makefile', 'makefile'],
    ['code-dotenv', '.env.production', 'dotenv'],
    ['code-cmake', 'CMakeLists.txt', 'cmake'],
  ]) {
    await page.getByRole('button', { name: id, exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.filumoTextExpansion
              .getCapabilities()
              .actions?.find((action) => action.id === 'code.language')?.value,
        ),
      )
      .toBe(language);
    await expect(page.locator('.filumo-title')).toHaveText(file);
    await expect(page.locator('.filumo-text-line-number').first()).toBeVisible();
  }
  await page.locator('.filumo-toolbar-more-trigger').click();
  await page.getByRole('menuitem', { name: '语言', exact: true }).click();
  const languages = page.getByRole('menu', { name: '语言', exact: true });
  expect(await languages.getByRole('separator').count()).toBeGreaterThanOrEqual(
    5,
  );
  await expect(
    languages.getByRole('menuitemradio', { name: 'CMake', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await languages
    .getByRole('menuitemradio', { name: 'YAML', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.filumoTextExpansion
            .getCapabilities()
            .actions?.find((action) => action.id === 'code.language')?.value,
      ),
    )
    .toBe('yaml');
  await expect(page.locator('.filumo-text-surface')).toContainText(
    'cmake_minimum_required',
  );
});

test('环境配置的引号注释与变量保持原文，补丁新增和删除在两种主题下可区分', async ({
  page,
}) => {
  await page.goto(server.url + '/text-expansion.html');
  await page.getByRole('button', { name: 'code-dotenv', exact: true }).click();
  await expect(page.locator('.hljs-variable').first()).toContainText(
    '${BASE_URL}',
  );
  const quoted = page
    .locator('.filumo-text-line-content')
    .filter({ hasText: 'APP_LABEL=' });
  await expect(quoted).toContainText('"中文 # 保留"');
  await expect(quoted.locator('.hljs-comment')).toHaveCount(0);
  await page.getByRole('button', { name: 'code-diff', exact: true }).click();
  const addition = page.locator('.hljs-addition'),
    deletion = page.locator('.hljs-deletion');
  await expect(addition).toHaveText('+new value');
  await expect(deletion).toHaveText('-old value');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => window.filumoTextExpansion.update({ theme: value }),
      theme,
    );
    // 主题刷新会替换可见行；从稳定容器同步读取两种颜色，避免比较已脱离文档的旧节点。
    await expect.poll(() => page.locator('.filumo-text-viewport').evaluate((viewport) => {
      const added = viewport.querySelector('.hljs-addition');
      const removed = viewport.querySelector('.hljs-deletion');
      if (!added || !removed) return false;
      const addedColor = getComputedStyle(added).color;
      const removedColor = getComputedStyle(removed).color;
      return Boolean(addedColor && removedColor && addedColor !== removedColor);
    })).toBe(true);
  }
});
test('Code 多行着色保持原文且 HTML 不执行', async ({ page }) => {
  await page.goto(server.url + '/text-expansion.html');
  await page
    .getByRole('button', { name: 'code-typescript', exact: true })
    .click();
  await expect(page.locator('.hljs-comment').first()).toBeVisible();
  await expect(page.locator('.filumo-text-line-number').first()).toBeVisible();
  await expect(page.locator('.filumo-text-line-number').first()).toHaveText('1');
  const comment = await page
    .locator('.hljs-comment')
    .first()
    .evaluate((node) => getComputedStyle(node).color);
  const plain = await page
    .locator('.filumo-text-surface')
    .evaluate((node) => getComputedStyle(node).color);
  expect(comment).not.toBe(plain);
  await expect(page.locator('.hljs-string')).toContainText(['中文', '第二行']);
  await page.getByRole('button', { name: 'code-html', exact: true }).click();
  await expect(page.locator('.filumo-text-surface')).toContainText(
    '<script>window.untrustedCode = true;</script>',
  );
  expect(await page.evaluate(() => window.untrustedCode)).toBeUndefined();
});

test('样式文件保留缩进，默认行号可通过更多菜单关闭', async ({ page }) => {
  await page.goto(server.url + '/text-expansion.html');
  for (const language of ['less', 'scss', 'sass']) {
    await page
      .getByRole('button', { name: 'code-' + language, exact: true })
      .click();
    const variable = page.locator('.hljs-variable').first();
    await expect(variable).toBeVisible();
    expect(
      await variable.evaluate((node) => getComputedStyle(node).color),
    ).not.toBe(
      await page
        .locator('.filumo-text-surface')
        .evaluate((node) => getComputedStyle(node).color),
    );
    await expect(page.locator('.filumo-text-line-number').first()).toBeVisible();
  }
  await expect(
    page
      .locator('.filumo-text-line-content')
      .filter({ hasText: 'color: $tone' })
      .first(),
  ).toHaveText('  color: $tone');
  await page.locator('.filumo-toolbar-more-trigger').click();
  const lines = page.getByRole('menuitemcheckbox', {
    name: '行号',
    exact: true,
  });
  await expect(lines).toHaveAttribute('aria-checked', 'true');
  await lines.click();
  await expect(page.locator('.filumo-text-line-number').first()).toBeHidden();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.filumoTextExpansion.update({ zoom: 125 }));
  await expect(page.locator('.filumo-text-line-number').first()).toBeHidden();
});
