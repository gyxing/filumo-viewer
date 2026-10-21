import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  loadLocalCatalog,
  resolveSampleFile,
} from '../../scripts/testing/local-samples.js';
test('本机样本缺配置可理解，越界和未知 ID 明确拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'filumo-sample-test-'));
  assert.equal((await loadLocalCatalog(root)).configured, false);
  await mkdir(join(root, 'tests/fixtures/local/files'), { recursive: true });
  const catalog = {
    samples: [{ id: 'a', relativePath: '../secret' }],
    aliases: {},
  };
  await assert.rejects(resolveSampleFile(root, '../secret', catalog));
  await assert.rejects(resolveSampleFile(root, 'a', catalog));
  assert.equal(await resolveSampleFile(root, 'missing', catalog), undefined);
  await writeFile(join(root, 'tests/fixtures/local/files/a.doc'), 'a');
  catalog.samples[0].relativePath = 'a.doc';
  assert.ok(
    (await resolveSampleFile(root, 'a', catalog)).absolute.endsWith('a.doc'),
  );
});
