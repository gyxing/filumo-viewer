import assert from 'node:assert/strict';
import test from 'node:test';
import { tarFixture, zipFixture } from '../fixtures/public/archive/samples.mjs';
import { archiveSource } from './helpers/archive-source.mjs';
const { ZipReader } = await archiveSource(
  'packages/archive/src/reader/zip/ZipReader.ts',
);
const { TarReader } = await archiveSource(
  'packages/archive/src/reader/tar/TarReader.ts',
);
const { ArchiveBudget } = await archiveSource(
  'packages/archive/src/reader/ArchiveBudget.ts',
);
test('逻辑 1 GiB ZIP 只访问目录和选中条目，不物化前置空间', async () => {
  const bytes = zipFixture({ 'small.txt': 'small' }),
    gap = 1024 ** 3,
    end = bytes.length - 22;
  let at = bytes.readUInt32LE(end + 16);
  const original = at;
  while (at < end) {
    bytes.writeUInt32LE(bytes.readUInt32LE(at + 42) + gap, at + 42);
    at +=
      46 +
      bytes.readUInt16LE(at + 28) +
      bytes.readUInt16LE(at + 30) +
      bytes.readUInt16LE(at + 32);
  }
  bytes.writeUInt32LE(original + gap, end + 16);
  const requests = [];
  const source = {
    readAll: async () => assert.fail('禁止物化大包'),
    getRangeReader: async () => ({
      length: gap + bytes.length,
      read: async (offset, length) => {
        requests.push([offset, length]);
        const output = new Uint8Array(length),
          a = Math.max(offset, gap),
          b = Math.min(offset + length, gap + bytes.length);
        if (b > a) output.set(bytes.subarray(a - gap, b - gap), a - offset);
        return output;
      },
    }),
    dispose: async () => {},
  };
  const signal = new AbortController().signal,
    reader = new ZipReader({
      source,
      budget: new ArchiveBudget(),
      format: 'zip',
      signal,
    });
  const entries = [];
  for await (const e of reader.scan(signal)) entries.push(e);
  assert.equal(entries.length, 1);
  assert.equal(
    await new Response(await reader.openEntry(entries[0].id, signal)).text(),
    'small',
  );
  assert.ok(requests.every(([, length]) => length < 1024 * 1024));
  await reader.close();
});
test('TAR 跳过 1 GiB 大条目，仍可浏览与提取后面的短文件', async () => {
  const huge = Buffer.from(tarFixture({ 'large.bin': '' }).subarray(0, 512)),
    size = 1024 ** 3;
  huge.write(size.toString(8).padStart(11, '0') + '\0', 124);
  huge.fill(32, 148, 156);
  huge.write(
    huge
      .reduce((a, b) => a + b, 0)
      .toString(8)
      .padStart(6, '0') + '\0 ',
    148,
  );
  const tail = tarFixture({ 'small.txt': 'small' }),
    next = size + 512,
    requests = [];
  const source = {
    readAll: async () => assert.fail('禁止物化大包'),
    getRangeReader: async () => ({
      length: next + tail.length,
      read: async (offset, length) => {
        requests.push(length);
        if (offset === 0) return new Uint8Array(huge.slice(0, length));
        return new Uint8Array(
          tail.slice(offset - next, offset - next + length),
        );
      },
    }),
    dispose: async () => {},
  };
  const signal = new AbortController().signal,
    reader = new TarReader({
      source,
      budget: new ArchiveBudget(),
      format: 'tar',
      signal,
    }),
    entries = [];
  for await (const e of reader.scan(signal)) entries.push(e);
  assert.equal(entries.length, 2);
  await assert.rejects(reader.openEntry(entries[0].id, signal), /上限/);
  assert.equal(
    await new Response(await reader.openEntry(entries[1].id, signal)).text(),
    'small',
  );
  assert.ok(requests.every((n) => n <= 512));
  await reader.close();
});
test('海量小文件在第 20001 条停止索引，不提取正文', async () => {
  const bytes = zipFixture(
      Object.fromEntries(
        Array.from({ length: 20001 }, (_, i) => ['empty-' + i + '.txt', '']),
      ),
    ),
    signal = new AbortController().signal,
    budget = new ArchiveBudget();
  const source = {
    readAll: async () => assert.fail('不能完整读取'),
    getRangeReader: async () => ({
      length: bytes.length,
      read: async (at, n) => new Uint8Array(bytes.slice(at, at + n)),
    }),
  };
  const reader = new ZipReader({ source, budget, format: 'zip', signal });
  let count = 0;
  try {
    await assert.rejects(async () => {
      for await (const entry of reader.scan(signal)) {
        void entry;
        count++;
      }
    }, /文件数量/);
    assert.equal(count, 20000);
    assert.equal(budget.used, 0);
  } finally {
    await reader.close();
  }
});
