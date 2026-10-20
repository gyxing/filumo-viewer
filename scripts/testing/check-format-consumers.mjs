import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installFrozenConsumer } from './install-consumer.mjs';
import { verifyInstalledPackages } from './pack-packages.mjs';

/** 独立安装只声明当前格式，防止标准预设依赖掩盖缺包和非必要第三方依赖。 */
export async function checkFormatConsumers(root, work, packed, overrides) {
  const reports = [];
  for (const name of [
    'text',
    'json',
    'markdown',
    'image',
    'pdf',
    'csv',
    'xml',
    'code',
  ]) {
    const directory = join(work, 'format-' + name);
    await mkdir(directory);
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify(
        {
          name: 'fivo-isolated-' + name,
          private: true,
          type: 'module',
          dependencies: { ['@fivo/' + name]: overrides['@fivo/' + name] },
          devDependencies: { vite: '5.4.21' },
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(directory, 'pnpm-workspace.yaml'),
      JSON.stringify({ autoInstallPeers: false, overrides }, null, 2),
    );
    const installation = await installFrozenConsumer(directory);
    await verifyInstalledPackages(directory, packed);
    const installed = await readdir(join(directory, 'node_modules/.pnpm'));
    if (
      (name !== 'markdown' &&
        installed.some((file) => /^marked@/.test(file))) ||
      (!['markdown', 'code'].includes(name) &&
        installed.some((file) => /^highlight\.js@/.test(file)))
    )
      throw Error(name + ' 独立安装意外包含文本渲染引擎');
    if (name !== 'xml' && installed.some((file) => /^saxes@/.test(file)))
      throw Error(name + ' 独立安装意外包含 XML 引擎');
    if (
      ['json', 'markdown', 'csv', 'xml', 'code'].includes(name) &&
      installed.some((file) => /^@fivo\+text@/.test(file))
    )
      throw Error(name + ' 不应反向依赖 Text 格式');
    const symbols =
      name === 'text'
        ? `import {readText} from '@fivo/text/reader'; import {mountTextSurface} from '@fivo/text/view'; void readText; void mountTextSurface;`
        : name === 'image'
        ? `import {mountImageSurface, mountImageOverlay} from '@fivo/image/view'; void mountImageSurface; void mountImageOverlay;`
        : name === 'pdf'
        ? `import {resolvePdfAssets} from '@fivo/pdf/assets'; void resolvePdfAssets;`
        : '';
    const source = `import {${name}} from '@fivo/${name}'; ${symbols} console.log(${name}());`;
    await writeFile(join(directory, 'main.ts'), source);
    await writeFile(
      join(directory, 'index.html'),
      '<!doctype html><script type="module" src="/main.ts"></script>',
    );
    await writeFile(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'Node',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          types: [],
          skipLibCheck: false,
        },
        files: ['main.ts'],
      }),
    );
    execFileSync(
      process.execPath,
      [
        join(root, 'node_modules/typescript/bin/tsc'),
        '-p',
        join(directory, 'tsconfig.json'),
      ],
      { cwd: directory, stdio: 'pipe' },
    );
    const { build } = await import(
      pathToFileURL(join(directory, 'node_modules/vite/dist/node/index.js'))
        .href
    );
    await build({
      root: directory,
      logLevel: 'warn',
      worker: { format: 'es' },
      build: { outDir: 'dist' },
    });
    const metadata = JSON.parse(
      await readFile(
        join(directory, 'node_modules/@fivo', name, 'package.json'),
        'utf8',
      ),
    );
    reports.push({
      id: 'format-' + name,
      directory,
      ...installation,
      dependencies: metadata.dependencies,
      build: 'passed',
      typeSmoke: 'passed',
    });
  }
  return reports;
}
