import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gzipFixture,
  tarGzipFixture,
} from '../fixtures/public/archive/samples.mjs';
import { archiveSource } from './helpers/archive-source.mjs';
const { GzipReader } = await archiveSource(
  'packages/archive/src/reader/gzip/GzipReader.ts',
);
const { TarGzipReader } = await archiveSource(
  'packages/archive/src/reader/gzip/TarGzipReader.ts',
);
const { ArchiveBudget } = await archiveSource(
  'packages/archive/src/reader/ArchiveBudget.ts',
);
test('GZIP 与 TAR.GZ 采用可重放流，不保存整份 TAR 输出', async () => {
  const signal = new AbortController().signal;
  for (const [Reader, bytes, name, count] of [
    [GzipReader, gzipFixture(), 'sample.txt.gz', 1],
    [TarGzipReader, tarGzipFixture(), 'sample.tar.gz', 2],
  ]) {
    let opens = 0;
    const source = {
      name,
      readAll: async () => assert.fail('不应全文读取'),
      openStream: async () => {
        opens++;
        return new Blob([bytes]).stream();
      },
      dispose: async () => {},
    };
    const budget = new ArchiveBudget(),
      reader = new Reader({ source, budget, format: 'gzip', signal });
    const entries = [];
    for await (const e of reader.scan(signal)) entries.push(e);
    assert.equal(entries.length, count);
    assert.equal(
      await new Response(await reader.openEntry(entries[0].id, signal)).text(),
      'Hello Filumo',
    );
    assert.equal(opens, 2);
    assert.ok(budget.used > 0);
    await reader.close();
  }
});
test('GZIP 校验失败及解压预算超限不会形成成功目录', async () => {
  for (const corrupt of [true, false]) {
    const bytes = gzipFixture('content beyond budget');
    if (corrupt) bytes[bytes.length - 8] ^= 1;
    const signal = new AbortController().signal,
      reader = new GzipReader({
        source: {
          name: 'text.gz',
          openStream: async () => new Blob([bytes]).stream(),
        },
        format: 'gzip',
        signal,
        budget: new ArchiveBudget(
          corrupt ? {} : { maxTotalUncompressedBytes: 1 },
        ),
      });
    await assert.rejects(async () => {
      for await (const entry of reader.scan(signal)) void entry;
    });
    await reader.close();
  }
});
