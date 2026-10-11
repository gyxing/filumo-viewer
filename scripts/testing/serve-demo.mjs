import { build } from 'esbuild';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './generate-samples.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
let framework = 'vanilla',
  port = 4173;
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === '--framework') framework = args[i + 1];
  else if (args[i] === '--port') port = Number(args[i + 1]);
  else throw new Error('未知示例参数');
}
if (
  !['vanilla', 'react', 'vue3', 'vue2'].includes(framework) ||
  !Number.isInteger(port) ||
  port < 0 ||
  port > 65535
)
  throw new Error('示例参数无效');
const output = join(root, 'tmp/testing/demo', framework + '-' + Date.now());
await mkdir(output, { recursive: true });
// 开发示例只解析已构建入口；正式打包消费由 check-consumers 验证，不引用 src 别名。
const aliases = {
  name: 'workspace-packages',
  setup(builder) {
    if (framework === 'react')
      builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, (args) => ({
        path: createRequire(join(root, 'apps/docs/package.json')).resolve(
          args.path,
        ),
      }));
    builder.onResolve(
      { filter: /^@fivo\/(core|dom|office|react|vue|vue2|viewer)$/ },
      (args) => ({
        path: join(root, 'packages', args.path.split('/')[1], 'dist/index.js'),
      }),
    );
    if (framework.startsWith('vue'))
      builder.onResolve({ filter: /^vue$/ }, () => ({
        path: realpathSync(
          join(
            root,
            'packages',
            framework === 'vue2' ? 'vue2' : 'vue',
            'node_modules/vue/dist',
            framework === 'vue2'
              ? 'vue.runtime.esm.js'
              : 'vue.runtime.esm-bundler.js',
          ),
        ),
      }));
  },
};
const result = await build({
  absWorkingDir: root,
  entryPoints: [
    join(
      root,
      'examples',
      framework,
      'src/main.' + (framework === 'react' ? 'tsx' : 'ts'),
    ),
  ],
  outdir: join(output, 'assets'),
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  metafile: true,
  plugins: [aliases],
  logLevel: 'warning',
});
const files = new Map([
  ['/shared/demo.css', join(root, 'examples/shared/demo.css')],
  ['/assets/worker.js', join(root, 'packages/office/dist/worker.js')],
]);
for (const kind of ['docx', 'xlsx', 'pptx'])
  files.set(
    '/fixtures/sample.' + kind,
    join(root, 'tests/fixtures/public/generated/sample.' + kind),
  );
for (const file of Object.keys(result.metafile.outputs)) {
  const absolute = resolve(root, file);
  files.set('/' + relative(output, absolute).replaceAll('\\', '/'), absolute);
}
const html = (
  await readFile(join(root, 'examples', framework, 'index.html'), 'utf8')
).replace(/src="\.\/src\/main\.tsx?"/, 'src="/assets/main.js"');
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = files.get(path);
    if (path !== '/' && !file) {
      res.writeHead(404).end();
      return;
    }
    const data = path === '/' ? html : await readFile(file);
    const type =
      path === '/'
        ? 'text/html'
        : { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] ??
          'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type + '; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(500).end('示例资源不可用，请先运行 build');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    'Fivo ' + framework + ' 示例：http://127.0.0.1:' + server.address().port,
  ),
);
