import { build } from 'esbuild';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_PACKAGES } from '../workspace-packages.js';
import './generate-samples.mjs';
import { servePdfFixture } from './serve-pdf-fixture.mjs';
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
    builder.onResolve({ filter: /^@filumo\// }, (args) => {
      const [, name, entry] = args.path.split('/');
      const item = WORKSPACE_PACKAGES.find((item) => item.name === name);
      if (
        item &&
        (!entry || Object.prototype.hasOwnProperty.call(item.entries, entry))
      )
        return {
          path: join(
            root,
            'packages',
            name,
            'dist',
            (entry ?? 'index') + '.js',
          ),
        };
    });
    // esbuild 不处理 Worker URL，示例服务按包隔离地址，防止新格式误用 Office Worker。
    builder.onLoad(
      {
        filter:
          /[\\/]packages[\\/](?:office|text|json|markdown|csv|xml|code)[\\/]dist[\\/]index\.js$/,
      },
      async ({ path }) => {
        const name = path.split(/[\\/]/).at(-3);
        const source = await readFile(path, 'utf8');
        return {
          loader: 'js',
          contents: source.replace(
            /(['"])\.\/worker\.js\1/g,
            JSON.stringify('/assets/' + name + '/worker.js'),
          ),
        };
      },
    );
    builder.onResolve(
      { filter: /^\/assets\/pdf\/generated\// },
      ({ path }) => ({
        path,
        external: true,
      }),
    );
    builder.onLoad(
      { filter: /[\\/]packages[\\/]pdf[\\/]dist[\\/]assets\.js$/ },
      async ({ path }) => ({
        loader: 'js',
        contents: (await readFile(path, 'utf8'))
          .replace(
            /(['"])\.\/worker\.js\1/g,
            JSON.stringify('/assets/pdf/worker.js'),
          )
          .replace(
            /import\((['"])\.\/generated\/pdf-text-layer\.js\1\)/g,
            "import('/assets/pdf/generated/pdf-text-layer.js')",
          ),
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
  entryPoints: {
    'image-pdf': join(root, 'tests/browser/harness/image-pdf.ts'),
    'text-formats': join(root, 'tests/browser/harness/text-formats.ts'),
    'text-expansion': join(root, 'tests/browser/harness/text-expansion.ts'),
    main: join(
      root,
      'examples',
      framework,
      'src/main.' + (framework === 'react' ? 'tsx' : 'ts'),
    ),
  },
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
  [
    '/assets/pdf/generated/pdf-text-layer.js',
    join(root, 'packages/pdf/dist/generated/pdf-text-layer.js'),
  ],
  ['/shared/demo.css', join(root, 'examples/shared/demo.css')],
  ['/assets/worker.js', join(root, 'packages/office/dist/worker.js')],
]);
// 测试页用真实产物映射核对请求边界，避免依赖哈希文件名猜测模块身份。
const assetGraph = {};
const sourceInputs = new Map();
for (const item of WORKSPACE_PACKAGES.filter(
  (item) => item.workerEntry || item.assetStrategy || item.name === 'image',
)) {
  const manifest = JSON.parse(
    await readFile(
      join(root, 'packages', item.name, 'dist/build-manifest.json'),
      'utf8',
    ),
  );
  for (const output of manifest.outputs)
    sourceInputs.set(
      resolve(root, 'packages', item.name, 'dist', output.file),
      output.inputs.map((input) => 'packages/' + item.name + '/' + input),
    );
  for (const file of manifest.worker?.outputs ?? [])
    files.set(
      '/assets/' + item.name + '/' + file,
      join(root, 'packages', item.name, 'dist', file),
    );
  for (const [file, info] of Object.entries(manifest.worker?.graph ?? {}))
    assetGraph['/assets/' + item.name + '/' + file] = Object.keys(
      info.inputs,
    ).map((input) => 'packages/' + item.name + '/' + input);
  for (const asset of manifest.pdfAssets?.assets ?? []) {
    files.set(
      '/assets/pdf/' + asset.file,
      join(root, 'packages/pdf/dist', asset.file),
    );
    assetGraph['/assets/pdf/' + asset.file] = [asset.source];
  }
}
for (const kind of ['docx', 'xlsx', 'pptx', 'svg', 'pdf'])
  files.set(
    '/fixtures/sample.' + kind,
    join(root, 'tests/fixtures/public/generated/sample.' + kind),
  );
for (const kind of ['password', 'scan'])
  files.set(
    '/fixtures/sample-' + kind + '.pdf',
    join(root, 'tests/fixtures/public/generated/sample-' + kind + '.pdf'),
  );
for (const file of Object.keys(result.metafile.outputs)) {
  const absolute = resolve(root, file);
  const path = '/' + relative(output, absolute).replaceAll('\\', '/');
  files.set(path, absolute);
  assetGraph[path] = Object.keys(result.metafile.outputs[file].inputs).flatMap(
    (input) => sourceInputs.get(resolve(root, input)) ?? [input],
  );
}
await writeFile(join(output, 'asset-graph.json'), JSON.stringify(assetGraph));
files.set('/asset-graph.json', join(output, 'asset-graph.json'));
const html = (
  await readFile(join(root, 'examples', framework, 'index.html'), 'utf8')
).replace(/src="\.\/src\/main\.tsx?"/, 'src="/assets/main.js"');
const textFormatsHtml =
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>文本格式验收</title><body><script type="module" src="/assets/text-formats.js"></script></body></html>';
const imagePdfHtml =
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>图片和 PDF 验收</title><body><script type="module" src="/assets/image-pdf.js"></script></body></html>';
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (servePdfFixture(req, res, path)) return;
    const file = files.get(path);
    const page =
      path === '/' ||
      path === '/text-formats.html' ||
      path === '/text-expansion.html' ||
      path === '/image-pdf.html';
    if (!page && !file) {
      res.writeHead(404).end();
      return;
    }
    const data = page
      ? path === '/'
        ? html
        : path === '/image-pdf.html'
        ? imagePdfHtml
        : path === '/text-expansion.html'
        ? textFormatsHtml.replaceAll('text-formats', 'text-expansion')
        : textFormatsHtml
      : await readFile(file);
    const type = page
      ? 'text/html'
      : {
          '.js': 'text/javascript',
          '.mjs': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.pdf': 'application/pdf',
          '.wasm': 'application/wasm',
        }[extname(file)] ?? 'application/octet-stream';
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
    'Filumo ' + framework + ' 示例：http://127.0.0.1:' + server.address().port,
  ),
);
