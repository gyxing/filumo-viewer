import less from 'less';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
/** 在原目录编译 Less，输出按视图加载的纯样式声明模块。 */
export function stylePlugin(metadata, styles, root) {
  const { group: name, version, styleScope: scope } = metadata;
  return {
    name: 'filumo-precompiled-styles',
    setup(builder) {
      builder.onResolve({ filter: /\.less$/ }, (args) => ({
        path: resolve(args.resolveDir, args.path),
        sideEffects: true,
      }));
      builder.onLoad({ filter: /\.less$/ }, async ({ path }) => {
        const source = await readFile(path, 'utf8');
        const css = (
          await less.render(
            scope ? '.' + scope + ' {\n' + source + '\n}' : source,
            { filename: path },
          )
        ).css;
        const hash = createHash('sha256')
          .update(css)
          .digest('hex')
          .slice(0, 16);
        const id = name + ':' + version + ':' + hash;
        styles.set(relative(root, path).replaceAll('\\', '/'), css);
        // Less 可位于任意子目录，DOM 自身必须定位包内运行时，避免相对路径随文件层级变化。
        const runtime =
          name === 'dom'
            ? resolve(root, 'packages/dom/src/styles.ts')
            : '@filumo/dom';
        return {
          loader: 'js',
          resolveDir: dirname(path),
          contents:
            'import {registerStyle} from ' +
            JSON.stringify(runtime) +
            '; registerStyle(' +
            JSON.stringify(name) +
            ',' +
            JSON.stringify(id) +
            ',' +
            JSON.stringify(css) +
            ');',
        };
      });
    },
  };
}
