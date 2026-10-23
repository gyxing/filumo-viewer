import { expect, test } from '@playwright/test';
import { startServer } from '../helpers.mjs';

let csvServer, officeServer;
test.beforeAll(async () => {
  csvServer = await startServer('scripts/testing/serve-demo.mjs', [
    '--framework',
    'vanilla',
    '--port',
    '0',
  ]);
  officeServer = await startServer('scripts/testing/serve-format-check.mjs');
});
test.afterAll(async () => {
  await csvServer?.close();
  await officeServer?.close();
});

/** 用真实鼠标拖动建立原生文字范围，不用脚本伪造 Selection。 */
async function selectTextPrefix(page, cell, count) {
  const points = await cell.evaluate((node, count) => {
    const walker = node.ownerDocument.createTreeWalker(
      node.querySelector('.filumo-grid-text'),
      4,
    );
    const text = walker.nextNode();
    const range = node.ownerDocument.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const start = range.getBoundingClientRect();
    range.setStart(text, count - 1);
    range.setEnd(text, count);
    const end = range.getBoundingClientRect();
    return {
      x1: start.left + 0.5,
      x2: end.right - 0.5,
      y: (start.top + start.bottom) / 2,
    };
  }, count);
  await page.mouse.move(points.x1, points.y);
  await page.mouse.down();
  await page.mouse.move(points.x2, points.y, { steps: 6 });
  await page.mouse.up();
}

for (const sample of [
  { name: 'CSV', id: 'csv-quoted', text: '包含', prefix: '包含' },
  { name: 'TSV', id: 'tsv-basic', text: '中文', prefix: '中' },
])
  test(
    sample.name + ' 选中文字后重绘仍可复制，Esc 后恢复单元格选区',
    async ({ page }) => {
      await page.goto(csvServer.url + '/text-expansion.html');
      await page.getByRole('button', { name: sample.id, exact: true }).click();
      const grid = page.locator('.filumo-csv-viewport');
      const cell = grid
        .locator('.filumo-csv-cell')
        .filter({ hasText: sample.text })
        .first();
      await expect(cell).toBeVisible();
      await selectTextPrefix(page, cell, sample.prefix.length);
      await expect
        .poll(() => page.evaluate(() => document.getSelection()?.toString()))
        .toBe(sample.prefix);
      await grid.evaluate((host) => host.dispatchEvent(new Event('scroll')));
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      expect(
        await page.evaluate(() => document.getSelection()?.toString()),
      ).toBe(sample.prefix);
      expect(
        await grid.evaluate((host) => {
          const copy = new KeyboardEvent('keydown', {
            key: 'c',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          });
          host.dispatchEvent(copy);
          return copy.defaultPrevented;
        }),
      ).toBe(false);
      await grid.press('Escape');
      await grid.press('Shift+ArrowRight');
      await expect(grid.locator('[aria-selected="true"]')).toHaveCount(
        sample.id === 'tsv-basic' ? 1 : 2,
      );
    },
  );

test('Excel 可选取单元格中的部分文字，滚动重绘不清空原生选区', async ({
  page,
}) => {
  await page.goto(
    officeServer.url + '/?sample=basic-xlsx&format=xlsx&engine=native',
  );
  await page.locator('#run').click();
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready', {
    timeout: 90000,
  });
  const grid = page.locator('.office-file-xlsx-virtual-grid');
  const cell = grid
    .locator('[data-grid-row="0"][data-grid-column="0"]')
    .first();
  await selectTextPrefix(page, cell, 6);
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.toString()))
    .toBe('Filumo');
  await grid.evaluate((host) => host.dispatchEvent(new Event('scroll')));
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe(
    'Filumo',
  );
  expect(
    await grid.evaluate((host) => {
      const copy = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      host.dispatchEvent(copy);
      return copy.defaultPrevented;
    }),
  ).toBe(false);
});

test('CSV 共享选区不随虚拟窗口消失，查找关闭后返回网格焦点', async ({
  page,
}) => {
  await page.goto(csvServer.url + '/text-expansion.html');
  await page.getByRole('button', { name: 'csv-wide', exact: true }).click();
  const grid = page.locator('.filumo-csv-viewport');
  await expect(grid).toHaveAttribute('aria-readonly', 'true');
  await page.locator('.filumo-csv-cell').first().click();
  await grid.press('Shift+ArrowRight');
  await expect(
    page.locator('.filumo-csv-cell[aria-selected="true"]'),
  ).toHaveCount(2);
  await grid.press('PageDown');
  await expect(grid).toHaveAttribute('aria-activedescendant', /^filumo-grid-/);
  await grid.press('Control+f');
  const search = page.locator('.filumo-csv-find input');
  await expect(search).toBeFocused();
  await search.press('Escape');
  await expect(grid).toBeFocused();
});

test('Excel 活动单元格、键盘和列宽使用共享交互，不修改源显示内容', async ({
  page,
}) => {
  await page.goto(
    officeServer.url + '/?sample=basic-xlsx&format=xlsx&engine=native',
  );
  await page.locator('#run').click();
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready', {
    timeout: 90000,
  });
  const grid = page.locator('.office-file-xlsx-virtual-grid');
  await expect(grid).toHaveAttribute('aria-readonly', 'true');
  const cell = page
    .locator('.office-file-xlsx-virtual-grid__cell[data-grid-row]')
    .first();
  await expect(cell).toBeVisible();
  const text = await cell.textContent();
  await cell.click();
  await expect(grid).toHaveAttribute('aria-activedescendant', /^filumo-grid-/);
  await grid.press('ArrowRight');
  await expect(page.locator('.filumo-grid-active-cell').first()).toBeVisible();
  const handle = page
    .locator(
      '.office-file-xlsx-virtual-grid__column-header .filumo-grid-column-resize',
    )
    .first();
  const header = handle.locator('..'),
    before = await header.boundingBox(),
    box = await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.up();
  await expect
    .poll(async () => (await header.boundingBox()).width)
    .toBeGreaterThan(before.width + 10);
  expect(await cell.textContent()).toBe(text);
});

test('Excel 连续调整列宽复用正文与表头，取消后恢复宽度和行高', async ({
  page,
}) => {
  await page.goto(
    officeServer.url + '/?sample=basic-xlsx&format=xlsx&engine=native',
  );
  await page.locator('#run').click();
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready', {
    timeout: 90000,
  });
  const grid = page.locator('.office-file-xlsx-virtual-grid');
  const handle = grid.locator('[data-resize-column="0"]').first();
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  await grid.evaluate((host) => {
    const cell = host.querySelector(
      '[data-grid-row="0"][data-grid-column="0"]',
    );
    const header = host.querySelector('[data-grid-header-column="0"]');
    host.resizeSnapshot = {
      cell,
      header,
      width: header.style.width,
      height: cell.style.height,
    };
  });
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const distance of [20, 40, 60]) {
    await page.mouse.move(x + distance, y);
    await expect
      .poll(() =>
        grid.evaluate(
          (host) =>
            parseFloat(
              host.querySelector('[data-grid-header-column="0"]').style.width,
            ) - parseFloat(host.resizeSnapshot.width),
        ),
      )
      .toBeGreaterThan(distance - 2);
    expect(
      await grid.evaluate((host) => {
        const { cell, header, height } = host.resizeSnapshot;
        return (
          cell ===
            host.querySelector('[data-grid-row="0"][data-grid-column="0"]') &&
          header === host.querySelector('[data-grid-header-column="0"]') &&
          cell.style.height === height
        );
      }),
    ).toBe(true);
  }
  await grid.press('Escape');
  await page.mouse.up();
  await expect
    .poll(() =>
      grid.evaluate(
        (host) =>
          host.querySelector('[data-grid-header-column="0"]').style.width ===
            host.resizeSnapshot.width &&
          host.querySelector('[data-grid-row="0"][data-grid-column="0"]').style
            .height === host.resizeSnapshot.height,
      ),
    )
    .toBe(true);
  await grid.evaluate((host) => {
    delete host.resizeSnapshot;
  });
});

test('多个查看器隔离选区和活动节点，释放一个不移除另一个的样式', async ({
  page,
}) => {
  await page.goto(csvServer.url + '/text-expansion.html');
  await page.getByRole('button', { name: 'csv-wide', exact: true }).click();
  const main = page.locator('.filumo-csv-viewport').first();
  await main.locator('.filumo-csv-cell').first().click();
  const active = await main.getAttribute('aria-activedescendant');
  await page.evaluate(() => window.filumoTextExpansion.addSibling());
  const sibling = page.locator('#grid-sibling .filumo-csv-viewport');
  await sibling.locator('.filumo-csv-cell').first().click();
  await sibling.press('Shift+ArrowRight');
  expect(await sibling.getAttribute('aria-activedescendant')).not.toBe(active);
  expect(await main.getAttribute('aria-activedescendant')).toBe(active);
  expect(
    await page
      .locator('[id^="filumo-grid-"]')
      .evaluateAll(
        (nodes) => new Set(nodes.map((node) => node.id)).size === nodes.length,
      ),
  ).toBe(true);
  const prevented = await sibling.evaluate((host) => {
    const input = document.createElement('input');
    host.append(input);
    input.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    input.remove();
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await page.evaluate(() => window.filumoTextExpansion.disposeSibling());
  await main.focus();
  await main.press('ArrowDown');
  await expect(main).toHaveAttribute('aria-activedescendant', /^filumo-grid-/);
  await expect(page.locator('.filumo-grid-selection').first()).toHaveCSS(
    'pointer-events',
    'none',
  );
});
