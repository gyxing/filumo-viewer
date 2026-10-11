import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const report = JSON.parse(
  await readFile(join(root, 'tmp/testing/consumers.json'), 'utf8'),
);
try {
  const hosts = JSON.parse(
    await readFile(join(root, 'tmp/testing/host-managers.json'), 'utf8'),
  );
  report.cases.push(...hosts.cases);
} catch {
  /* 未运行备用包管理器验收时只显示 pnpm 消费者。 */
}
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') {
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(
          '<h1>Fivo 实际消费验证</h1>' +
            report.cases
              .map(
                (item) =>
                  '<p><a href="/' + item.id + '/">' + item.id + '</a></p>',
              )
              .join(''),
        );
      return;
    }
    const parts = path.split('/');
    const item = report.cases.find((item) => item.id === parts[1]);
    if (!item) {
      res.writeHead(404).end();
      return;
    }
    const file = resolve(item.dist, parts.slice(2).join('/') || 'index.html');
    if (!file.startsWith(resolve(item.dist) + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (path.endsWith('/checks.html'))
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'nonce-fivo-test'; style-src-attr 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob:; font-src 'self' data: blob:",
      );
    const data = await readFile(file);
    res
      .writeHead(200, {
        'Content-Type':
          ({
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.html': 'text/html',
          }[extname(file)] ?? 'application/octet-stream') + '; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      .end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(0, '127.0.0.1', () =>
  console.log('消费验证：http://127.0.0.1:' + server.address().port),
);
