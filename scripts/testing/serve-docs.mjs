import { lstat, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { normalizeDocsBase } from '../../apps/docs/config/base-path.js';
const root = resolve('apps/docs/dist');
const base = normalizeDocsBase(process.env.FILUMO_DOCS_BASE);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    let file = resolve(
      root,
      decodeURIComponent(url.pathname.slice(base.length)) || 'index.html',
    );
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if ((await lstat(file)).isDirectory()) file = resolve(file, 'index.html');
    res.setHeader(
      'Content-Type',
      ({
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
      }[extname(file)] ?? 'application/octet-stream') + '; charset=utf-8',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(0, '127.0.0.1', () =>
  console.log('文档：http://127.0.0.1:' + server.address().port),
);
