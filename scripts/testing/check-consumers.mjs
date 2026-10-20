import { execFileSync } from 'node:child_process';
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkFormatConsumers } from './check-format-consumers.mjs';
import { auditConsumerGraph, trackWorkerOutput } from './consumer-graph.mjs';
import './generate-samples.mjs';
import { installFrozenConsumer } from './install-consumer.mjs';
import { packPackages, verifyInstalledPackages } from './pack-packages.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const work = await mkdtemp(join(tmpdir(), 'fivo-consumers-'));
const tarballs = join(work, 'tarballs');
await mkdir(tarballs);
const packed = await packPackages(root, tarballs);
const overrides = Object.fromEntries(
  Object.entries(packed).map(([name, record]) => [
    name,
    'file:' + record.file.replaceAll('\\', '/'),
  ]),
);
const cases = [
  ['vanilla', 'vanilla'],
  ['react18', 'react', '18.3.1'],
  ['react19', 'react', '19.2.0'],
  ['react-strict', 'react', '18.3.1'],
  ['vue3', 'vue3', '3.5.43'],
  ['vue26', 'vue2', '2.6.14'],
  ['vue27', 'vue2', '2.7.16'],
];
const report = {
  work,
  tarballs: packed,
  createdAt: new Date().toISOString(),
  cases: [],
};
await mkdir(join(root, 'tmp/testing'), { recursive: true });
for (const [id, example, version] of cases) {
  console.log('消费构建：' + id);
  const directory = join(work, id);
  await mkdir(directory);
  await cp(join(root, 'examples', example), join(directory, 'app'), {
    recursive: true,
  });
  await cp(join(root, 'examples/shared'), join(directory, 'shared'), {
    recursive: true,
  });
  if (id === 'vanilla') {
    await copyFile(
      join(root, 'tests/browser/harness/acceptance.html'),
      join(directory, 'app/checks.html'),
    );
    await copyFile(
      join(root, 'tests/browser/harness/acceptance.ts'),
      join(directory, 'app/acceptance.ts'),
    );
  }
  const metadata = JSON.parse(
    await readFile(join(root, 'examples', example, 'package.json'), 'utf8'),
  );
  metadata.dependencies['@fivo/core'] = overrides['@fivo/core'];
  metadata.dependencies['@fivo/viewer'] = overrides['@fivo/viewer'];
  for (const name of ['text', 'json', 'markdown', 'image', 'pdf'])
    metadata.dependencies['@fivo/' + name] = overrides['@fivo/' + name];
  for (const name of Object.keys(metadata.dependencies))
    if (overrides[name]) metadata.dependencies[name] = overrides[name];
  if (example === 'react') {
    metadata.dependencies.react = version;
    metadata.dependencies['react-dom'] = version;
  }
  if (example.startsWith('vue')) metadata.dependencies.vue = version;
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify(metadata, null, 2),
  );
  await writeFile(
    join(directory, 'pnpm-workspace.yaml'),
    JSON.stringify(
      { autoInstallPeers: false, verifyDepsBeforeRun: 'error', overrides },
      null,
      2,
    ),
  );
  const installation = await installFrozenConsumer(directory);
  await verifyInstalledPackages(directory, packed);
  const installed = (
    await readdir(join(directory, 'node_modules/.pnpm'))
  ).filter((name) => /^(react|react-dom|preact)@/.test(name));
  if (!id.startsWith('react') && installed.length)
    throw new Error(id + ' 意外安装框架兼容运行时：' + installed.join(','));
  await writeFile(
    join(directory, 'type-smoke.ts'),
    "import {office,type OfficeOptions} from '@fivo/office'; import {standardPlugins} from '@fivo/viewer'; import {createSession} from '@fivo/core'; import type {ViewerHandle} from '@fivo/dom'; import {OutlineTree,type OutlineSnapshot} from '@fivo/dom/outline'; import {text} from '@fivo/text'; import {readText} from '@fivo/text/reader'; import {mountTextSurface} from '@fivo/text/view'; import {json} from '@fivo/json'; import {markdown} from '@fivo/markdown'; const options:OfficeOptions={worker:'never',onWarning:warning=>console.log(warning.code)}; const plugin=office(options); let viewer:ViewerHandle|undefined; let outline:OutlineTree<{id:string}>|undefined; let outlineSnapshot:OutlineSnapshot<{id:string}>|undefined; void outline; void outlineSnapshot; void viewer; void plugin; void standardPlugins; void createSession; void text; void readText; void mountTextSurface; void json; void markdown;\n",
  );
  await writeFile(
    join(directory, 'tsconfig-smoke.json'),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'ESNext',
          moduleResolution: 'Node',
          target: 'ES2020',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          types: [],
          skipLibCheck: false,
        },
        files: ['type-smoke.ts'],
      },
      null,
      2,
    ),
  );
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      join(directory, 'tsconfig-smoke.json'),
    ],
    { cwd: directory, stdio: 'pipe' },
  );
  const fixtures = join(directory, 'app/public/fixtures');
  await mkdir(fixtures, { recursive: true });
  for (const kind of ['docx', 'xlsx', 'pptx', 'svg', 'pdf'])
    await copyFile(
      join(root, 'tests/fixtures/public/generated/sample.' + kind),
      join(fixtures, 'sample.' + kind),
    );
  if (id === 'vanilla')
    for (const name of ['dom', 'office', 'image'])
      await copyFile(
        join(root, 'packages', name, 'dist/styles.css'),
        join(directory, 'app/public/external-' + name + '.css'),
      );
  const officeRoot = await realpath(
    join(directory, 'node_modules/@fivo/office'),
  );
  const pdfRoot = await realpath(join(directory, 'node_modules/@fivo/pdf'));
  await cp(
    join(pdfRoot, 'dist/assets/pdfjs'),
    join(directory, 'app/public/assets/pdf/assets/pdfjs'),
    { recursive: true },
  );
  const officeManifest = JSON.parse(
    await readFile(join(officeRoot, 'dist/build-manifest.json'), 'utf8'),
  );
  const workerEntries = new Set();
  let graph;
  const audit = {
    name: 'fivo-static-import-audit',
    generateBundle(_options, bundle) {
      graph = auditConsumerGraph(bundle, officeRoot, officeManifest);
      if (graph.violations.length) throw Error(graph.violations.join('; '));
      if (!id.startsWith('react') && graph.eagerReact)
        throw Error('非 React 宿主提前加载 React');
    },
  };
  const { build } = await import(
    pathToFileURL(join(directory, 'node_modules/vite/dist/node/index.js')).href
  );
  await build({
    define:
      id === 'react-strict'
        ? { 'process.env.NODE_ENV': JSON.stringify('development') }
        : undefined,
    plugins: [audit],
    worker: {
      format: 'es',
      plugins: () => [
        trackWorkerOutput(
          join(officeRoot, 'dist', officeManifest.worker.publicPath),
          workerEntries,
        ),
      ],
    },
    root: join(directory, 'app'),
    base: '/' + id + '/',
    logLevel: 'warn',
    build: {
      outDir: join(directory, 'dist'),
      emptyOutDir: false,
      manifest: true,
      rollupOptions: {
        input:
          id === 'vanilla'
            ? {
                main: join(directory, 'app/index.html'),
                checks: join(directory, 'app/checks.html'),
              }
            : join(directory, 'app/index.html'),
      },
      chunkSizeWarningLimit: 5000,
    },
  });
  if (!workerEntries.size) throw Error(id + ' 未输出默认 Worker 入口');
  for (const file of workerEntries)
    await readFile(join(directory, 'dist', file));
  await writeFile(
    join(directory, 'dist/fivo-consumer.json'),
    JSON.stringify({ graph, worker: [...workerEntries] }),
  );
  report.cases.push({
    id,
    graph,
    example,
    frameworkVersion: version ?? null,
    directory,
    dist: join(directory, 'dist'),
    build: 'passed',
    ...installation,
    typeSmoke: 'passed',
    installedFrameworkRuntimes: installed,
    officeReactFree: !JSON.parse(
      await readFile(join(root, 'packages/office/package.json'), 'utf8'),
    ).dependencies.react,
    worker: [...workerEntries],
  });
  await writeFile(
    join(root, 'tmp/testing/consumers.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
report.formats = await checkFormatConsumers(root, work, packed, overrides);
await writeFile(
  join(root, 'tmp/testing/consumers.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log('真实 tarball 消费构建完成：' + work);
