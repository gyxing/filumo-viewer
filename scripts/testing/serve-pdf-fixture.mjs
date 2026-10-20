import { createPdfFixture } from '../../tests/fixtures/public/image-pdf/samples.mjs';
let bytes;

/** 同源测试路由覆盖鉴权、真实区间、全文回退与读取期间版本变化。 */
export function servePdfFixture(req, res, path) {
  const match =
    /^\/fixtures\/pdf-(range|private|full|changed|no-length|slow)\.pdf$/.exec(
      path,
    );
  if (!match) return false;
  const mode = match[1];
  if (mode === 'private' && req.headers['x-fivo-fixture'] !== 'allowed') {
    res.writeHead(401).end();
    return true;
  }
  bytes ??= createPdfFixture(1000, true);
  const changed = mode === 'changed' && req.headers['if-range'];
  const headers = {
    'Content-Type': 'application/pdf',
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
    ETag: changed ? '"fixture-v2"' : '"fixture-v1"',
  };
  const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
  if (range && mode !== 'full' && mode !== 'no-length' && !changed) {
    const begin = Number(range[1]),
      end = Math.min(Number(range[2]), bytes.length - 1);
    if (begin > end || begin >= bytes.length) {
      res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end();
      return true;
    }
    res.writeHead(206, {
      ...headers,
      'Content-Length': end - begin + 1,
      'Content-Range': `bytes ${begin}-${end}/${bytes.length}`,
    });
    if (mode === 'slow' && req.method !== 'HEAD') {
      let offset = begin,
        timer;
      const send = () => {
        const next = Math.min(end + 1, offset + 16384);
        res.write(bytes.subarray(offset, next));
        offset = next;
        if (offset > end) res.end();
        else timer = setTimeout(send, 10);
      };
      res.on('close', () => clearTimeout(timer));
      send();
    } else
      res.end(
        req.method === 'HEAD' ? undefined : bytes.subarray(begin, end + 1),
      );
  } else {
    res.writeHead(200, {
      ...headers,
      ...(mode === 'no-length' ? {} : { 'Content-Length': bytes.length }),
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  }
  return true;
}
