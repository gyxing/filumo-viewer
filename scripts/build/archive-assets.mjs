import { build } from 'esbuild';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

/** 只复制固定发行包及许可资源，不运行上游构建或使用默认 CDN。 */
export async function copyArchiveAssets(directory, output) {
  const require = createRequire(join(directory, 'package.json'));
  const entry = require.resolve('libarchive-wasm');
  const root = dirname(entry);
  const metadata = JSON.parse(
    await readFile(join(root, '../package.json'), 'utf8'),
  );
  if (metadata.version !== '1.2.0')
    throw new Error('归档 WASM 引擎必须固定为 1.2.0');
  await mkdir(join(output, 'generated'), { recursive: true });
  const target = join(output, 'generated/libarchive.wasm');
  await copyFile(join(root, 'libarchive.wasm'), target);
  const assets = [
    {
      file: relative(output, target).replaceAll('\\', '/'),
      role: 'wasm',
      source: 'libarchive-wasm/dist/libarchive.wasm',
    },
  ];
  // 先生成独立浏览器 ESM，避免宿主再次把上游 Node 分支当成浏览器依赖解析。
  await build({
    stdin: {
      contents:
        'export { ArchiveReader, libarchiveWasm } from ' +
        JSON.stringify(entry) +
        ';',
      resolveDir: directory,
      sourcefile: 'archive-engine.mjs',
    },
    outfile: join(output, 'generated/engine.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2020',
    external: ['fs', 'path', 'url', 'module', 'crypto', 'node:*'],
    logLevel: 'warning',
  });
  await writeFile(
    join(output, 'generated/engine.d.ts'),
    "export {ArchiveReader,libarchiveWasm} from 'libarchive-wasm';\n",
    'utf8',
  );
  assets.push(
    {
      file: 'generated/engine.js',
      role: 'engine',
      source: 'libarchive-wasm/dist/index.js',
    },
    { file: 'generated/engine.d.ts', role: 'types', source: 'libarchive-wasm' },
  );
  const notice = await readFile(
    join(directory, 'THIRD_PARTY_NOTICES.md'),
    'utf8',
  );
  await writeFile(join(output, 'generated/NOTICE.txt'), notice, 'utf8');
  assets.push({
    file: 'generated/NOTICE.txt',
    role: 'notice',
    source: 'Filumo archive integration',
  });
  await mkdir(join(output, 'generated/licenses'), { recursive: true });
  for (const file of await readdir(join(directory, 'third-party'))) {
    await copyFile(
      join(directory, 'third-party', file),
      join(output, 'generated/licenses', file),
    );
    assets.push({
      file: 'generated/licenses/' + file,
      role: 'license',
      source: 'third-party/' + file,
    });
  }
  return { version: metadata.version, assets };
}
