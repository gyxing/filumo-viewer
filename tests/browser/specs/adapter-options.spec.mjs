import { expect, test } from '@playwright/test';
import { isolateNetwork, startServer } from '../helpers.mjs';

test('React 丢弃的并发渲染不替换已提交查看器的回调', async ({ page }) => {
  const server = await startServer('scripts/testing/serve-demo.mjs', [
    '--framework',
    'react',
    '--port',
    '0',
  ]);
  try {
    await isolateNetwork(page);
    await page.goto(server.url + '/adapter.html');
    await expect
      .poll(() => page.evaluate(() => window.filumoAdapter.ready()))
      .toBe(true);
    await page.evaluate(() => window.filumoAdapter.startDiscarded());
    await expect
      .poll(() => page.evaluate(() => window.filumoAdapter.attempted()))
      .toBe('discarded');
    await expect(page.locator('[data-phase="committed"]')).toHaveCount(1);
    expect(await page.evaluate(() => window.filumoAdapter.trigger())).toBe(
      'committed',
    );
    await page.evaluate(() => window.filumoAdapter.commit());
    expect(await page.evaluate(() => window.filumoAdapter.trigger())).toBe(
      'next',
    );
    await page.evaluate(() => window.filumoAdapter.dispose());
    await expect(page.locator('.filumo-viewer')).toHaveCount(0);
  } finally {
    await server.close();
  }
});

test('Vue3 重建型配置只重建一次，普通配置仍只更新视图', async ({ page }) => {
  const server = await startServer('scripts/testing/serve-demo.mjs', [
    '--framework',
    'vue3',
    '--port',
    '0',
  ]);
  try {
    await isolateNetwork(page);
    await page.goto(server.url + '/adapter.html');
    await expect
      .poll(() => page.evaluate(() => window.filumoAdapter.metrics().ready))
      .toBe(1);
    await page.evaluate(() => window.filumoAdapter.rebuild());
    await expect
      .poll(() => page.evaluate(() => window.filumoAdapter.metrics().ready))
      .toBe(2);
    expect(
      await page.evaluate(() => window.filumoAdapter.metrics().updates),
    ).toBe(0);
    expect(
      await page.evaluate(() => window.filumoAdapter.metrics().disposed),
    ).toBe(1);
    await page.evaluate(() => window.filumoAdapter.update());
    await expect
      .poll(() => page.evaluate(() => window.filumoAdapter.metrics().updates))
      .toBe(1);
    expect(
      await page.evaluate(() => window.filumoAdapter.metrics().ready),
    ).toBe(2);
    await page.evaluate(() => window.filumoAdapter.dispose());
    await expect(page.locator('.filumo-viewer')).toHaveCount(0);
  } finally {
    await server.close();
  }
});
