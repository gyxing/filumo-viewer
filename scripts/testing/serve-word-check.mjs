import { build } from 'esbuild';
import less from 'less';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './generate-samples.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'tmp/testing/word-parity');
await mkdir(output, { recursive: true });
// esbuild 并行加载 Less，按文件保存结果，避免复合赋值跨 await 丢失其他样式。
const css = new Map();
const styles = {
  name: 'native-style-fixture',
  setup(builder) {
    builder.onLoad({ filter: /\.less$/ }, async ({ path }) => {
      const compiled = await less.render(await readFile(path, 'utf8'), {
        filename: path,
      });
      css.set(path, compiled.css);
      return { contents: '', loader: 'js' };
    });
  },
};
const built = await build({
  absWorkingDir: root,
  entryPoints: [
    join(root, 'tests/browser/harness/word.ts'),
    join(root, 'tests/browser/harness/outline.ts'),
  ],
  outdir: output,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  metafile: true,
  alias: { '@filumo/dom/outline': join(root, 'packages/dom/src/outline.ts') },
  plugins: [styles],
  logLevel: 'warning',
});
const files = new Map(
  Object.keys(built.metafile.outputs).map((file) => [
    '/' + relative(output, resolve(root, file)).replaceAll('\\', '/'),
    resolve(root, file),
  ]),
);
files.set(
  '/complex.docx',
  join(root, 'tests/fixtures/public/generated/sample-complex.docx'),
);
files.set(
  '/reference.json',
  join(root, 'tests/fixtures/public/reference/word-long-table.json'),
);
const html =
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>原生 Word 分页对照</title><link rel="stylesheet" href="/styles.css"><button id="run">运行分页对照</button><pre id="result"></pre><div id="preview" style="position:relative;width:1000px;min-height:300px"></div><script type="module" src="/word.js"></script></html>';
createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path === '/' || path === '/outline.html') {
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(
          path === '/outline.html'
            ? html.replace('/word.js', '/outline.js')
            : html,
        );
      return;
    }
    if (path === '/styles.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' }).end(
        [...css.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, value]) => value)
          .join('\n'),
      );
      return;
    }
    const file = files.get(path);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, { 'Content-Type': 'text/javascript' })
      .end(await readFile(file));
  } catch {
    res.writeHead(500).end();
  }
}).listen(0, '127.0.0.1', function () {
  console.log('M3 服务验收：http://127.0.0.1:' + this.address().port);
});
