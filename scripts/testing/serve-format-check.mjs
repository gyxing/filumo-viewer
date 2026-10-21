import { build } from 'esbuild';
import less from 'less';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './generate-samples.mjs';
import { sampleCatalog } from './sample-catalog.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'tmp/testing/format-check-' + process.pid);
await mkdir(output, { recursive: true });
const samples = await sampleCatalog(
  root,
  process.env.FILUMO_LOCAL_SAMPLES === '1',
);
// 各个 Less 回调并行执行，不能用 css += await ... 累加共享字符串。
const css = new Map();
const result = await build({
  absWorkingDir: root,
  entryPoints: [
    join(root, 'tests/browser/harness/format-preview.ts'),
    join(root, 'tests/browser/harness/toolbar.ts'),
  ],
  outdir: output,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  metafile: true,
  logLevel: 'warning',
  plugins: [
    {
      name: 'paired-styles',
      setup(builder) {
        builder.onLoad({ filter: /\.less$/ }, async ({ path }) => {
          const compiled = await less.render(await readFile(path, 'utf8'), {
            filename: path,
          });
          css.set(path, compiled.css);
          return { contents: '', loader: 'js' };
        });
      },
    },
  ],
});
const assets = new Map(
  Object.keys(result.metafile.outputs).map((file) => [
    '/' + relative(output, resolve(root, file)).replaceAll('\\', '/'),
    resolve(root, file),
  ]),
);
const html =
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Office 新旧同样本验收</title><link rel="stylesheet" href="/styles.css"><button id="run">打开样本</button><button id="snapshot">记录布局</button><button id="next">下一页</button><button id="destroy">销毁</button><pre id="result"></pre><div id="preview" style="width:1100px;height:780px"></div><script type="module" src="/format-preview.js"></script></html>';
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
  const pathname = new URL(req.url, 'http://localhost').pathname;
  try {
    if (pathname === '/' || pathname === '/toolbar.html')
      return res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(
          pathname === '/toolbar.html'
            ? html.replace('/format-preview.js', '/toolbar.js')
            : html,
        );
    if (pathname === '/styles.css')
      return res
        .writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' })
        .end(
          [...css.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, value]) => value)
            .join('\n'),
        );
    if (pathname === '/samples.json')
      return res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(
          JSON.stringify(
            samples.map(({ absolute, path, ...sample }) => sample),
          ),
        );
    const sample = samples.find((item) => pathname === '/samples/' + item.id);
    const file = sample?.absolute || assets.get(pathname);
    if (!file) return res.writeHead(404).end();
    const data = await readFile(file);
    res
      .writeHead(200, {
        'Content-Type':
          extname(file) === '.js'
            ? 'text/javascript'
            : 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(data);
  } catch {
    res.writeHead(500).end('测试资产读取失败');
  }
});
server.listen(0, '127.0.0.1', () =>
  console.log('格式对照：http://127.0.0.1:' + server.address().port),
);
