import { zipFixture } from '../../tests/fixtures/public/archive/samples.mjs';
import { createPdfFixture } from '../../tests/fixtures/public/image-pdf/samples.mjs';

// 无业务数据的大样本让探测窗口与全文传输有可观测差异。
const samples = {
  zip: zipFixture({
    'readme.txt': 'Hello Filumo',
    'padding.bin': Buffer.alloc(1024 * 1024, 7),
  }),
  pdf: Buffer.from(createPdfFixture(1000)),
};
const requests = new Map();

/** 为浏览器来源回归提供真实区间、慢流和连接统计，不影响普通示例路由。 */
export function serveSourceFixture(req, res, pathname) {
  if (!pathname.startsWith('/source-fixtures/')) return false;
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token') ?? 'default';
  if (pathname === '/source-fixtures/stats') {
    res
      .writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      .end(JSON.stringify(requests.get(token) ?? []));
    return true;
  }
  const [, , mode, kind] = pathname.split('/');
  const bytes = samples[kind];
  if (!bytes || !['range', 'stream', 'no-length', 'paused'].includes(mode)) {
    res.writeHead(404).end();
    return true;
  }
  const record = {
    range: req.headers.range ?? null,
    sentBytes: 0,
    completed: false,
    closedEarly: false,
    total: bytes.length,
  };
  const list = requests.get(token) ?? [];
  list.push(record);
  requests.set(token, list);
  let begin = 0,
    end = bytes.length - 1;
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
  };
  if (mode === 'range' && req.headers.range) {
    const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range);
    if (!match || Number(match[1]) >= bytes.length) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + bytes.length }).end();
      return true;
    }
    begin = Number(match[1]);
    end = Math.min(Number(match[2]), end);
    headers['Content-Range'] = `bytes ${begin}-${end}/${bytes.length}`;
  }
  if (mode !== 'no-length') headers['Content-Length'] = end - begin + 1;
  res.writeHead(mode === 'range' && req.headers.range ? 206 : 200, headers);
  let offset = begin,
    timer;
  res.on('close', () => {
    clearTimeout(timer);
    record.closedEarly = !record.completed;
  });
  const send = () => {
    if (res.destroyed) return;
    const next = Math.min(end + 1, offset + 4096);
    res.write(bytes.subarray(offset, next));
    record.sentBytes += next - offset;
    offset = next;
    if (offset > end) {
      record.completed = true;
      res.end();
    } else if (mode !== 'paused') timer = setTimeout(send, 2);
  };
  if (req.method === 'HEAD') {
    record.completed = true;
    res.end();
  } else send();
  return true;
}
