import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { validateReference } from '../../../scripts/checks/reference-contract.mjs';
import { isolateNetwork, startServer } from '../helpers.mjs';
let server;
const local = process.env.FIVO_LOCAL_SAMPLES === '1',
  mode = local ? 'local' : 'public',
  observations = [];
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-format-check.mjs');
});
test.afterAll(async () => {
  await server?.close();
  await mkdir('tmp/testing/' + mode, { recursive: true });
  await writeFile(
    'tmp/testing/' + mode + '/format-observations.json',
    JSON.stringify(observations, null, 2),
  );
});
const ids = [
  'basic-docx',
  'basic-xlsx',
  'basic-pptx',
  'word-long-table',
  ...(local
    ? [
        'links-doc',
        'links-docx',
        'links-xls',
        'links-xlsx',
        'links-ppt',
        'links-pptx',
        'binary-word',
        'binary-sheet',
        'binary-slides',
      ]
    : []),
];
for (const id of ids)
  test('固定样本回归：' + id, async ({ page, request }, info) => {
    const sample = (
      await (await request.get(server.url + '/samples.json')).json()
    ).find((s) => s.id === id);
    expect(sample).toBeTruthy();
    const ref = JSON.parse(
      await readFile(
        'tests/fixtures/' +
          (sample.local ? 'local' : 'public') +
          '/reference/' +
          id +
          '.json',
        'utf8',
      ),
    );
    expect(sample.sha256).toBe(ref.fixtureSha256);
    await isolateNetwork(page);
    await page.goto(
      server.url +
        '/?sample=' +
        id +
        '&format=' +
        sample.format +
        '&engine=native',
    );
    await page.locator('#run').click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'ready', {
      timeout: 90000,
    });
    const first = JSON.parse(await page.locator('#result').textContent());
    const verdict = validateReference(first, ref.first);
    expect(verdict.failures).toEqual([]);
    await info.attach('current-view', {
      body: await page.locator('#preview').screenshot(),
      contentType: 'image/png',
    });
    if (ref.next) {
      await page.locator('#next').click();
      await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
      const next = JSON.parse(await page.locator('#result').textContent());
      expect(validateReference(next, ref.next).failures).toEqual([]);
    }
    await page.locator('#destroy').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-state',
      'destroyed',
    );
    expect(JSON.parse(await page.locator('#result').textContent())).toEqual({
      remainingNodes: 0,
      styles: 0,
    });
    observations.push({
      sample: { id, format: sample.format, sha256: sample.sha256 },
      status: 'passed',
      reference: true,
      navigated: !!ref.next,
    });
  });
