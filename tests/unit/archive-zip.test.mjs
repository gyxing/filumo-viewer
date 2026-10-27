import assert from 'node:assert/strict';
import test from 'node:test';
import { zipFixture } from '../fixtures/public/archive/samples.mjs';
import { archiveSource } from './helpers/archive-source.mjs';
const { ZipReader } = await archiveSource(
  'packages/archive/src/reader/zip/ZipReader.ts',
);
const { ArchiveBudget } = await archiveSource(
  'packages/archive/src/reader/ArchiveBudget.ts',
);
test('ZIP 保留中央目录与单条目读取，不调用 readAll', async () => {
  const bytes = zipFixture(),
    signal = new AbortController().signal;
  let calls = 0;
  const source = {
    readAll: async () => assert.fail('不应完整读取'),
    getRangeReader: async () => ({
      length: bytes.length,
      read: async (at, n) => {
        calls++;
        return new Uint8Array(bytes.slice(at, at + n));
      },
    }),
    dispose: async () => {},
  };
  const reader = new ZipReader({
    source,
    budget: new ArchiveBudget(),
    format: 'zip',
    signal,
  });
  const entries = [];
  for await (const e of reader.scan(signal)) entries.push(e);
  assert.equal(entries.length, 2);
  assert.equal(
    await new Response(await reader.openEntry(entries[0].id, signal)).text(),
    'Hello Filumo',
  );
  assert.ok(calls > 0);
  await reader.close();
});
