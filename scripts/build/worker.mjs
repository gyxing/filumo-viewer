import { build } from 'esbuild';
import { join } from 'node:path';

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
