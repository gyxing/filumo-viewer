import { build } from 'esbuild';
import { basename, join } from 'node:path';

/** Worker 是公开独立资产，不与主入口静态打包在一起。 */
export async function buildOfficeWorker(directory, root) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [
      join(directory, 'src/engine/parsing/runtime/worker/entry.js'),
    ],
    outfile: join(directory, 'dist/worker.js'),
    bundle: true,
    splitting: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    metafile: true,
    logLevel: 'warning',
  });
  return result.metafile;
}

/** 新格式 Worker 保留内部动态任务边界，原文解码不能顺带加载格式解析器。 */
export async function buildFormatWorker(directory, root, entry) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: { worker: join(directory, entry) },
    outdir: join(directory, 'dist'),
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    chunkNames: 'worker-chunks/[name]-[hash]',
    external:
      basename(directory) === 'archive'
        ? ['@filumo/archive/assets', 'fs', 'path', 'url', 'module', 'node:*']
        : [],
    metafile: true,
    logLevel: 'warning',
  });
  return result.metafile;
}
