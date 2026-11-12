import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPackages, verifyPackedFile } from './pack-packages.mjs';
import { runPnpm } from './package-manager.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
await mkdir(join(root, 'tmp'), { recursive: true });
const scratch = await mkdtemp(join(root, 'tmp/unified-consumer-'));
const packed = (
  await packPackages(root, join(scratch, 'tarballs'), ['viewer'])
)['@filumo/viewer'];
await verifyPackedFile(packed);

const cases = [
  {
    name: 'pdf',
    peers: {},
    formats: ['core', 'dom', 'pdf'],
    source: `import {createViewer} from '@filumo/viewer/dom'; import {pdf} from '@filumo/viewer/pdf';
      export const open=(container:HTMLElement)=>createViewer(container,{plugins:[pdf()]});`,
  },
  {
    name: 'react',
    peers: {
      react: '18.3.1',
      'react-dom': '18.3.1',
      '@types/react': '18.3.31',
      '@types/react-dom': '18.3.7',
    },
    formats: [
      'core',
      'dom',
      'react',
      'office',
      'image',
      'pdf',
      'csv',
      'archive',
    ],
    source: `import React from 'react'; import {DocumentViewer,type ToolbarAction} from '@filumo/viewer/react';
      import {office} from '@filumo/viewer/office'; import {pdf} from '@filumo/viewer/pdf';
      import {csv} from '@filumo/viewer/csv'; import {zip} from '@filumo/viewer/archive/zip';
      const action:ToolbarAction={id:'host.close',kind:'action',label:'关闭',icon:React.createElement('span'),run(){}};
      export const Preview=()=>React.createElement(DocumentViewer,{plugins:[office(),pdf(),csv(),zip()],options:{toolbarActions:[action]}});`,
  },
  {
    name: 'vue3',
    peers: { vue: '3.5.43' },
    formats: ['core', 'dom', 'vue', 'pdf'],
    source: `import {h} from 'vue'; import {DocumentViewer,type ToolbarAction} from '@filumo/viewer/vue'; import {pdf} from '@filumo/viewer/pdf';
      const action:ToolbarAction={id:'host.close',kind:'action',label:'关闭',icon:()=>h('span'),run(){}};
      export const Preview=()=>h(DocumentViewer,{plugins:[pdf()],options:{toolbarActions:[action]}});`,
  },
  {
    name: 'vue2',
    peers: { vue: '2.7.16' },
    formats: ['core', 'dom', 'vue2', 'pdf'],
    source: `import Vue from 'vue'; import {DocumentViewer,type ToolbarAction} from '@filumo/viewer/vue2'; import {pdf} from '@filumo/viewer/pdf';
      const action:ToolbarAction={id:'host.close',kind:'action',label:'关闭',icon:h=>h('span'),run(){}};
      export const Preview=()=>new Vue({render:h=>h(DocumentViewer,{props:{plugins:[pdf()],options:{toolbarActions:[action]}}})});`,
  },
];
const results = [];
const requested = process.argv.slice(2);
if (requested.some((name) => !cases.some((fixture) => fixture.name === name)))
  throw Error('未知统一包消费场景');
for (const fixture of cases.filter(
  (item) => !requested.length || requested.includes(item.name),
)) {
  const directory = join(scratch, fixture.name);
  await mkdir(directory);
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          '@filumo/viewer': 'file:' + packed.file.replaceAll('\\', '/'),
          ...fixture.peers,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(directory, 'pnpm-workspace.yaml'),
    'packages: []\nautoInstallPeers: false\n',
  );
  const install = runPnpm(['install', '--offline', '--ignore-scripts', '--no-optional'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  await writeFile(join(directory, 'install.log'), install);
  await writeFile(join(directory, 'entry.ts'), fixture.source);
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        noEmit: true,
      },
      files: ['entry.ts'],
    }),
  );
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      join(directory, 'tsconfig.json'),
    ],
    { cwd: directory, stdio: 'pipe', windowsHide: true },
  );
  const output = await build({
    absWorkingDir: directory,
    entryPoints: ['entry.ts'],
    outdir: join(directory, 'dist'),
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    metafile: true,
    write: false,
    logLevel: 'silent',
  });
  const activeInputs = new Set(
    Object.values(output.metafile.outputs).flatMap((info) =>
      Object.entries(info.inputs)
        .filter(([, entry]) => entry.bytesInOutput > 0)
        .map(([file]) => file),
    ),
  );
  const inputs = [...activeInputs].map((file) => file.replaceAll('\\', '/'));
  const selected = [
    ...new Set(
      inputs.flatMap(
        (file) => file.match(/\/dist\/modules\/([^/]+)\//)?.slice(1, 2) ?? [],
      ),
    ),
  ].sort();
  const extra = selected.filter((name) => !fixture.formats.includes(name));
  if (extra.length)
    throw Error(fixture.name + ' 引入无关模块：' + extra.join(','));
  if (
    fixture.name === 'react' &&
    inputs.some((file) => /libarchive-wasm/.test(file))
  )
    throw Error('ZIP 专用入口引入通用归档引擎');
  const installed = JSON.parse(
    await readFile(
      join(directory, 'node_modules/@filumo/viewer/package.json'),
      'utf8',
    ),
  );
  if (
    Object.keys(installed.dependencies ?? {}).some((name) =>
      name.startsWith('@filumo/'),
    )
  )
    throw Error('统一包仍依赖其他 Filumo 运行包');
  await writeFile(
    join(directory, 'metafile.json'),
    JSON.stringify(output.metafile, null, 2),
  );
  results.push({
    fixture: fixture.name,
    types: 'passed',
    modules: selected,
    outputs: output.outputFiles.length,
  });
  console.log('统一包独立消费通过：' + fixture.name);
}
await writeFile(
  join(scratch, 'results.json'),
  JSON.stringify({ packed, results }, null, 2),
);
console.log(JSON.stringify({ scratch, results }));
