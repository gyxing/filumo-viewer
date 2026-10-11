import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuildManifest } from './manifest.mjs';
import { resolveBuildOrder } from './build-order.mjs';
import { preparePackageMetadata, readPackageMetadata } from './metadata.mjs';
import { serializeStyles } from './style-order.mjs';
import { stylePlugin } from './styles.mjs';
import { buildOfficeWorker } from './worker.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
await preparePackageMetadata(ROOT);
// 构建顺序保证后继包生成声明时已经能读取前置包的公开声明。
const PACKAGES = ['core', 'dom', 'office', 'react', 'vue', 'vue2', 'viewer'];
const requested = process.argv.slice(2);
const manifests = Object.fromEntries(
  await Promise.all(
    PACKAGES.map(async (name) => [
      name,
      JSON.parse(await readFile(join(ROOT, 'packages', name, 'package.json'), 'utf8')),
    ]),
  ),
);
const names = resolveBuildOrder(requested.length ? requested : PACKAGES, manifests);

/** 清除声明中不属于公开运行时接口的 Less 副作用引用。 */
async function normalizeDeclarations(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await normalizeDeclarations(path);
    else if (entry.name.endsWith('.d.ts')) {
      const text = await readFile(path, 'utf8');
      const next = text.replace(/^import\s+['"][^'"]+\.less['"];?\s*$/gm, '');
      if (next !== text) await writeFile(path, next, 'utf8');
    }
  }
}

/** 仅清理当前包的生成目录，避免哈希分块残留或误删源码。 */
async function prepareOutput(directory, name) {
  const packagesRoot = await realpath(join(ROOT, 'packages'));
  const packageRoot = await realpath(directory);
  if (dirname(packageRoot) !== packagesRoot || basename(packageRoot) !== name)
    throw new Error('包目录不在预期工作区内');
  const output = join(packageRoot, 'dist');
  const stat = await lstat(output).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (
    stat &&
    (!stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(output)) !== output)
  )
    throw new Error('拒绝清理非预期构建目录');
  // 已确认绝对目标是当前包内的 dist，且不存在目录链接。
  if (stat) await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  return output;
}

for (const name of names) {
  const directory = join(ROOT, 'packages', name);
  const metadata = await readPackageMetadata(directory);
  const output = await prepareOutput(directory, name);
  const styles = new Map();
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: [join(directory, 'src/index.ts')],
    outdir: output,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    packages: 'external',
    chunkNames: 'chunks/[name]-[hash]',
    metafile: true,
    plugins: [stylePlugin(metadata, styles, ROOT)],
    logLevel: 'warning',
  });
  // 实现检查仍覆盖全部 Office 及 Worker；声明只从共享公开合同生成。
  if (name === 'office')
    execFileSync(
      process.execPath,
      [
        join(ROOT, 'node_modules/typescript/bin/tsc'),
        '-p',
        join(directory, 'tsconfig.json'),
        '--noEmit',
        '--emitDeclarationOnly',
        'false',
      ],
      { cwd: ROOT, stdio: 'inherit' },
    );
  execFileSync(
    process.execPath,
    [
      join(ROOT, 'node_modules/typescript/bin/tsc'),
      '-p',
      join(
        directory,
        name === 'office' ? 'tsconfig.types.json' : 'tsconfig.json',
      ),
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
  await normalizeDeclarations(output);
  const workerMetafile =
    name === 'office' ? await buildOfficeWorker(directory, ROOT) : undefined;
  await writeFile(
    join(output, 'styles.css'),
    ':root { --fivo-style-' +
      name +
      ': ' +
      metadata.version +
      '; }\n' +
      serializeStyles(styles),
    'utf8',
  );
  await writeFile(
    join(output, 'build-manifest.json'),
    JSON.stringify(
      {
        ...createBuildManifest(metadata, result.metafile, workerMetafile, {
          root: ROOT,
          directory,
        }),
        styleCount: styles.size,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(
    '已构建 ' + metadata.name + '（自动样式 ' + styles.size + ' 组）',
  );
}
