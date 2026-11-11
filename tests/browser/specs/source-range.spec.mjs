import { expect, test } from '@playwright/test';
import { isolateNetwork, startServer } from '../helpers.mjs';
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

for (const kind of ['zip', 'pdf'])
  for (const mode of ['range', 'stream', 'no-length']) {
    test(`${kind} 无扩展名 ${mode} 探测有界且正式打开可读`, async ({
      page,
      request,
    }, info) => {
      await isolateNetwork(page);
      await page.goto(server.url + '/source-range.html');
      await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
      const token = `${kind}-${mode}`;
      const url = `/source-fixtures/${mode}/${kind}?token=${token}`;
      const result = await page.evaluate(
        (value) => window.filumoSourceRange.probe(value),
        url,
      );
      expect(result.lengths).toEqual([8, 32, 65536]);
      await expect
        .poll(async () => {
          const records = await (
            await request.get(
              server.url + '/source-fixtures/stats?token=' + token,
            )
          ).json();
          return records[0]?.completed || records[0]?.closedEarly;
        })
        .toBe(true);
      const records = await (
        await request.get(server.url + '/source-fixtures/stats?token=' + token)
      ).json();
      expect(records).toHaveLength(1);
      expect(records[0].sentBytes).toBeLessThan(records[0].total);
      if (mode === 'range') expect(records[0].sentBytes).toBe(262144);
      else {
        expect(records[0].closedEarly).toBe(true);
        expect(records[0].sentBytes).toBeLessThanOrEqual(131072);
      }
      await info.attach('probe-network', {
        body: JSON.stringify({ result, records }),
        contentType: 'application/json',
      });
      await page.evaluate(
        (value) => window.filumoSourceRange.open(value),
        url + '-open',
      );
      if (kind === 'pdf')
        await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible();
      else
        await expect(
          page.locator('.filumo-archive-row').filter({ hasText: 'readme.txt' }),
        ).toBeVisible();
    });
  }

test('探测过程中销毁会断开来源且不回写迟到结果', async ({ page, request }) => {
  await isolateNetwork(page);
  await page.goto(server.url + '/source-range.html');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    window.pendingProbe = window.filumoSourceRange
      .probe('/source-fixtures/paused/zip?token=cancel')
      .then(
        () => 'ready',
        () => 'cancelled',
      );
  });
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(
              server.url + '/source-fixtures/stats?token=cancel',
            )
          ).json()
        ).length,
    )
    .toBe(1);
  await page.evaluate(() => window.filumoSourceRange.dispose());
  expect(await page.evaluate(() => window.pendingProbe)).toBe('cancelled');
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(
              server.url + '/source-fixtures/stats?token=cancel',
            )
          ).json()
        )[0].closedEarly,
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
