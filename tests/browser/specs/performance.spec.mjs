import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { sourceDigest } from '../../../scripts/checks/evidence.mjs';
import { isolateNetwork, startServer } from '../helpers.mjs';
let server;
const report = {
  schemaVersion: 1,
  mode: 'native-reference',
  samples: [],
  budgetApproval: 'pending-user-review',
};
test.beforeAll(async ({ browser }) => {
  server = await startServer('scripts/testing/serve-format-check.mjs');
  report.sourceDigest = await sourceDigest(process.cwd());
  report.environment = {
    browser: browser.version(),
    viewport: { width: 1440, height: 1000 },
    dpr: 1,
    locale: 'zh-CN',
    worker: 'never',
    warmup: 1,
    repetitions: 5,
  };
});
test.afterAll(async () => {
  await server?.close();
  await mkdir('tmp/testing/local', { recursive: true });
  await writeFile(
    'tmp/testing/local/baseline.json',
    JSON.stringify(report, null, 2),
  );
});
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const id of ['word-long-table', 'links-xls', 'links-ppt']) {
  test('五次同环境性能采样：' + id, async ({ context, request }, info) => {
    const sample = (
      await (await request.get(server.url + '/samples.json')).json()
    ).find((item) => item.id === id);
    expect(sample).toBeTruthy();
    const records = {
      id,
      format: sample.format,
      sha256: sample.sha256,
      bytes: sample.bytes,
      native: [],
    };
    // 交替执行顺序降低热缓存偏差；预热不进入统计，堆内存仅为时点观测，不能当作峰值或泄漏结论。
    for (let round = 0; round < 6; round++) {
      for (const engine of ['native']) {
        const page = await context.newPage();
        try {
          await isolateNetwork(page);
          await page.goto(
            server.url +
              '/?sample=' +
              id +
              '&format=' +
              sample.format +
              '&engine=' +
              engine,
          );
          await page.locator('#run').click();
          await expect(page.locator('body')).toHaveAttribute(
            'data-state',
            'ready',
            { timeout: 90000 },
          );
          const { readyMs, nodes, heapBytes, longTaskCount, longTaskMs } =
            JSON.parse(await page.locator('#result').textContent());
          expect(readyMs).toBeGreaterThan(0);
          if (round)
            records[engine].push({
              readyMs,
              nodes,
              heapBytes,
              longTaskCount,
              longTaskMs,
            });
          await page.locator('#destroy').click();
          await expect(page.locator('body')).toHaveAttribute(
            'data-state',
            'destroyed',
          );
          expect(
            JSON.parse(await page.locator('#result').textContent())
              .remainingNodes,
          ).toBe(0);
        } finally {
          await page.close();
        }
      }
    }
    records.comparison = {
      nativeMedianMs: median(records.native.map((x) => x.readyMs)),
      nativeNodeMedian: median(records.native.map((x) => x.nodes)),
    };
    const frozen = JSON.parse(
      await readFile('tests/fixtures/local/reference/performance.json', 'utf8'),
    );
    const reference = frozen.samples.find((item) => item.id === id);
    records.comparison.referenceMedianMs =
      reference?.comparison?.nativeMedianMs;
    records.comparison.environmentMatched =
      frozen.environment.browser === report.environment.browser;
    records.comparison.ratio =
      records.comparison.nativeMedianMs / records.comparison.referenceMedianMs;
    report.samples.push(records);
    await info.attach('paired-performance', {
      body: JSON.stringify(records),
      contentType: 'application/json',
    });
  });
}
