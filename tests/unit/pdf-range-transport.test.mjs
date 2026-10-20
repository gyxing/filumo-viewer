import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const bundle = await build({
  entryPoints: ['packages/pdf/src/runtime/PdfRangeTransport.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { createPdfRangeTransport } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('PDF 通过 Reader 读取，重叠请求的进度不重复计数', async () => {
  const calls = [],
    progress = [],
    chunks = [];
  class Transport {
    onDataRange(begin, bytes) {
      chunks.push([begin, bytes.length]);
    }
  }
  const reader = {
    length: 12,
    read: async (offset, length) => {
      calls.push([offset, length]);
      return new Uint8Array(length);
    },
  };
  const transport = createPdfRangeTransport(
    { PDFDataRangeTransport: Transport },
    reader,
    new AbortController().signal,
    (error) => {
      throw error;
    },
    new Uint8Array(),
    (loaded) => progress.push(loaded),
  );
  transport.requestDataRange(0, 8);
  transport.requestDataRange(4, 12);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [
    [0, 8],
    [4, 8],
  ]);
  assert.deepEqual(chunks, [
    [0, 8],
    [4, 8],
  ]);
  assert.equal(progress.at(-1), 12);
  transport.abort();
});

test('会话退出中止在途读取，不交付迟到数据', async () => {
  let deliver,
    readSignal,
    deliveries = 0;
  class Transport {
    onDataRange() {
      deliveries++;
    }
  }
  const controller = new AbortController(),
    transport = createPdfRangeTransport(
      { PDFDataRangeTransport: Transport },
      {
        length: 8,
        read: (_offset, _length, signal) => {
          readSignal = signal;
          return new Promise((resolve) => {
            deliver = resolve;
          });
        },
      },
      controller.signal,
      () => {},
    );
  transport.requestDataRange(0, 8);
  controller.abort();
  assert.equal(readSignal.aborted, true);
  deliver(new Uint8Array(8));
  await Promise.resolve();
  assert.equal(deliveries, 0);
  transport.abort();
});

test('区间传输交付首段副本，并声明没有持续推送的数据流', () => {
  const first = Uint8Array.of(1, 2, 3, 4);
  let received;
  class Transport {
    constructor(length, initial, done) {
      received = { length, initial, done };
    }
    onDataRange() {}
  }
  const transport = createPdfRangeTransport(
    { PDFDataRangeTransport: Transport },
    { length: 12, read: async () => new Uint8Array() },
    new AbortController().signal,
    () => {},
    first,
  );
  assert.equal(received.length, 12);
  assert.equal(received.done, true);
  assert.deepEqual(received.initial, first);
  assert.notEqual(received.initial.buffer, first.buffer);
  transport.abort();
});

test('区间传给 Worker 时不分离来源持有的缓冲', async () => {
  const bytes = Uint8Array.of(1, 2, 3, 4);
  let delivered;
  class Transport {
    onDataRange(_begin, data) {
      delivered = structuredClone(data, { transfer: [data.buffer] });
    }
    onDataProgress() {}
  }
  const transport = createPdfRangeTransport(
    { PDFDataRangeTransport: Transport },
    { length: 4, read: async () => bytes },
    new AbortController().signal,
    () => {},
  );
  transport.requestDataRange(0, 4);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(bytes.byteLength, 4);
  assert.deepEqual(delivered, bytes);
  transport.abort();
});
