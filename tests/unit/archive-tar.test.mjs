import assert from 'node:assert/strict';
import test from 'node:test';
import { tarFixture } from '../fixtures/public/archive/samples.mjs';
import { archiveSource } from './helpers/archive-source.mjs';
const { TarReader } = await archiveSource(
  'packages/archive/src/reader/tar/TarReader.ts',
);
const { ArchiveBudget } = await archiveSource(
  'packages/archive/src/reader/ArchiveBudget.ts',
);
test('TAR 目录扫描跳过正文，按条目提取且校验损坏头', async () => {
  const bytes = tarFixture(),
    signal = new AbortController().signal,
    reads = [];
  const source = {
    readAll: async () => assert.fail('不能完整读取'),
    getRangeReader: async () => ({
      length: bytes.length,
      read: async (at, n) => {
        reads.push([at, n]);
        return new Uint8Array(bytes.slice(at, at + n));
      },
    }),
    dispose: async () => {},
  };
  const reader = new TarReader({
    source,
    budget: new ArchiveBudget(),
    format: 'tar',
    signal,
  });
  const entries = [];
  for await (const e of reader.scan(signal)) entries.push(e);
  assert.equal(entries.length, 2);
  assert.ok(reads.every(([, n]) => n === 512));
  const stream = await reader.openEntry(entries[0].id, signal);
  assert.equal(await new Response(stream).text(), 'Hello Filumo');
  await reader.close();
  bytes[0] ^= 1;
  const bad = new TarReader({
    source,
    budget: new ArchiveBudget(),
    format: 'tar',
    signal,
  });
  await assert.rejects(async () => {
    for await (const ignored of bad.scan(signal)) void ignored;
  }, /校验/);
});
