import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

const bundle = await build({
  entryPoints: ['apps/docs/server/source-dev-plugin.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { default: sourceDevPlugin } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

/** 只记录插件使用的配置接口，不启动 Webpack 或开发服务。 */
function configureSourceDev(refreshOptions) {
  const rules = new Map();
  const plugins = new Map();
  if (refreshOptions) plugins.set('fastRefresh', [refreshOptions]);
  let configure;
  sourceDevPlugin({
    cwd: resolve('apps/docs'),
    modifyConfig() {},
    chainWebpack(callback) {
      configure = callback;
    },
    addBeforeMiddlewares() {},
    addEntryCode() {},
    onDevCompileDone() {},
  });
  const config = {
    module: {
      rule(name) {
        if (!rules.has(name)) {
          const rule = {
            include: new Set(),
            exclude: new Set(),
            test() {
              return this;
            },
            type() {
              return this;
            },
            sideEffects() {
              return this;
            },
            use() {
              return this;
            },
            loader() {
              return this;
            },
            options() {
              return this;
            },
          };
          rules.set(name, rule);
        }
        return rules.get(name);
      },
    },
    plugins,
    plugin(name) {
      return {
        tap(callback) {
          plugins.set(name, callback(plugins.get(name)));
          return this;
        },
        use(implementation, options) {
          plugins.set(name, { implementation, options });
          return this;
        },
      };
    },
  };
  configure(config, { webpack: { NormalModuleReplacementPlugin: class {} } });
  return { rules, plugins };
}

/** 与 Refresh 的排除条件一致：数组取任一匹配，保留既有正则和路径。 */
function matches(condition, file) {
  if (Array.isArray(condition))
    return condition.some((entry) => matches(entry, file));
  if (typeof condition === 'string') return file.startsWith(condition);
  return condition.test(file);
}

test('PDF 生成 Worker、引擎和回退模块不经过 Babel 与 React Refresh', () => {
  const { rules, plugins } = configureSourceDev({ overlay: false });
  const [refresh] = plugins.get('fastRefresh');
  for (const file of [
    'worker.js',
    'assets/pdfjs/legacy/build/pdf.mjs',
    'assets/pdfjs/wasm/openjpeg_nowasm_fallback.js',
  ]) {
    const resource = resolve('packages/pdf/src/generated', file);
    for (const name of ['src', 'extra-src'])
      assert.ok(
        [...rules.get(name).exclude].some((condition) =>
          matches(condition, resource),
        ),
      );
    assert.ok(matches(refresh.exclude, resource));
  }
  assert.equal(refresh.overlay, false);
  assert.ok(matches(refresh.exclude, resolve('node_modules/react/index.js')));
  for (const resource of [
    resolve('apps/docs/src/components/Playground.tsx'),
    resolve('packages/pdf/src/runtime/PdfSession.ts'),
    resolve('packages/pdf/src/generated-example.js'),
    resolve('packages/archive/src/runtime/ArchiveSession.ts'),
    resolve('packages/archive/src/generated-example.js'),
  ]) {
    assert.equal(matches(refresh.exclude, resource), false);
    for (const name of ['src', 'extra-src'])
      assert.equal(
        [...rules.get(name).exclude].some((condition) =>
          matches(condition, resource),
        ),
        false,
      );
  }
});

test('Archive 生成引擎不经过 Babel 与 React Refresh，路径转义保持精确', () => {
  const { rules, plugins } = configureSourceDev({ overlay: false });
  const [refresh] = plugins.get('fastRefresh');
  const resource = resolve('packages/archive/src/generated/engine.js');
  assert.ok(matches(refresh.exclude, resource));
  for (const name of ['src', 'extra-src'])
    assert.ok(
      [...rules.get(name).exclude].some((condition) =>
        matches(condition, resource),
      ),
    );
});

test('添加资源排除时保留宿主既有的 Refresh 排除项', () => {
  const existing = [/node_modules/i, /skip-refresh\.js$/];
  const { plugins } = configureSourceDev({ exclude: existing, overlay: false });
  const [refresh] = plugins.get('fastRefresh');
  assert.ok(matches(refresh.exclude, resolve('apps/docs/src/skip-refresh.js')));
  assert.ok(matches(refresh.exclude, resolve('node_modules/react/index.js')));
  assert.equal(existing.length, 2);
  assert.ok(
    refresh.exclude.every(
      (condition) =>
        typeof condition === 'string' || condition instanceof RegExp,
    ),
  );
});

test('未启用 React Refresh 时只设置源码边界，不新增热更新插件', () => {
  const { rules, plugins } = configureSourceDev();
  assert.equal(plugins.has('fastRefresh'), false);
  assert.ok(rules.get('extra-src').exclude.size);
});
