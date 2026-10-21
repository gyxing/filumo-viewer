import type { DocumentRangeReader } from '@filumo/core';
import type { EngineRangeTransport, PdfEngine } from './pdfEngine';
/** 引擎的区间请求只消费 Core Reader，不能绕开来源鉴权和资源限制。 */
export function createPdfRangeTransport(
  engine: PdfEngine,
  reader: DocumentRangeReader,
  signal: AbortSignal,
  fail: (error: unknown) => void,
  initialData = new Uint8Array(),
  reportProgress?: (loaded: number, total: number) => void,
): EngineRangeTransport {
  const transport = new engine.PDFDataRangeTransport(
    reader.length,
    initialData.slice(),
    true,
  );
  const abort = new AbortController();
  // 仅支持主动区间读取，没有额外的渐进推送流，首段先交给引擎启动解析。
  let ranges: Array<[number, number]> = initialData.length
    ? [[0, initialData.length]]
    : [];
  const close = () => abort.abort(signal.reason);
  signal.addEventListener('abort', close, { once: true });
  transport.abort = () => {
    abort.abort();
    signal.removeEventListener('abort', close);
  };
  transport.requestDataRange = (begin, end) => {
    if (abort.signal.aborted) return;
    void reader
      .read(begin, end - begin, abort.signal)
      .then((data) => {
        if (abort.signal.aborted) return;
        // 第三方 Reader 可能复用返回缓冲；只将 PDF 自己的副本交给可转移通道。
        transport.onDataRange(begin, data.slice());
        // 合并已交付的区间，重叠请求不能重复累计进度。
        ranges.push([begin, begin + data.length]);
        ranges.sort((a, b) => a[0] - b[0]);
        const merged: Array<[number, number]> = [];
        for (const range of ranges) {
          const last = merged[merged.length - 1];
          if (last && range[0] <= last[1])
            last[1] = Math.max(last[1], range[1]);
          else merged.push(range);
        }
        ranges = merged;
        reportProgress?.(
          ranges.reduce((sum, [start, end]) => sum + end - start, 0),
          reader.length,
        );
      })
      .catch((error) => {
        if (!abort.signal.aborted) fail(error);
      });
  };
  if (signal.aborted) close();
  return transport;
}
