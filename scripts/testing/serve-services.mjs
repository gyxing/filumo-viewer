import { build } from 'esbuild';
import less from 'less';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'tmp/testing/service-browser');
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
  entryPoints: [join(root, 'tests/browser/harness/services.ts')],
  outdir: output,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  metafile: true,
  plugins: [styles],
  logLevel: 'warning',
});
if (
  Object.keys(built.metafile.inputs).some((file) =>
    /node_modules.*(?:react|vue)|compat[\\/]react/.test(file),
  )
)
  throw new Error('原生服务测试入口意外引入框架');
const files = new Map(
  Object.keys(built.metafile.outputs).map((file) => [
    '/' + relative(output, resolve(root, file)).replaceAll('\\', '/'),
    resolve(root, file),
  ]),
);
const html =
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>M3 原生服务验收</title><link rel="stylesheet" href="/styles.css"><button id="run">运行原生服务验收</button><pre id="result"></pre><div id="preview" style="position:relative;width:700px;min-height:300px"></div><script type="module" src="/services.js"></script></html>';
createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path === '/') {
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(html);
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
