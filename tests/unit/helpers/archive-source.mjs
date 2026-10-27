import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
/** 读取器回归使用源码，外部编解码器保持安装后的真实实现。 */
export async function archiveSource(entry) {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    alias: { '@filumo/core': resolve('packages/core/src/index.ts') },
    plugins: [
      {
        name: 'zip-browser-core',
        setup(b) {
          b.onResolve({ filter: /^@zip\.js\/zip\.js/ }, (args) => ({
            path: pathToFileURL(
              resolve('packages/archive/node_modules', args.path),
            ).href,
            external: true,
          }));
        },
      },
    ],
  });
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(output.outputFiles[0].text).toString('base64')
  );
}
