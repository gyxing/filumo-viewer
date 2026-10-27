import type { IApi } from 'dumi';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve, sep } from 'node:path';
import { WORKSPACE_PACKAGES } from '../../../scripts/workspace-packages.js';
import { withDocsBase } from '../config/base-path.js';

interface DevCompileResult {
  isFirstCompile: boolean;
  stats: {
    hasErrors(): boolean;
    compilation: { compiler: { modifiedFiles?: ReadonlySet<string> } };
  };
}

/** 开发服务直接消费工作区源码；DOM 和 Worker 更新后刷新，避免沿用旧会话。 */
export default (api: IApi) => {
  const root = resolve(api.cwd, '../..');
  // 精确入口别名不接管 styles.css 等发布子路径，也不改变第三方包解析。
  const packages = WORKSPACE_PACKAGES.map((item) => item.name);
  const sources = packages.map((name) =>
    resolve(root, 'packages', name, 'src'),
  );
  const styleSources = WORKSPACE_PACKAGES.filter(
    (item) => item.name === 'dom' || item.scopedStyles,
  ).map((item) => resolve(root, 'packages', item.name, 'src'));
  const pdfGenerated = resolve(root, 'packages/pdf/src/generated');
  // 第三方发行资源不能注入 React 运行时，目录边界也不能误伤同名前缀的源码。
  const pdfGeneratedPattern = new RegExp(
    '^' + pdfGenerated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[\\\\/]|$)',
  );
  const archiveGenerated = resolve(root, 'packages/archive/src/generated');
  const archiveGeneratedPattern = new RegExp(
    '^' +
      archiveGenerated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '(?:[\\\\/]|$)',
  );
  const clients = new Set<ServerResponse>();
  let pendingReload = false;

  api.modifyConfig((config) => ({
    ...config,
    mfsu: false,
    alias: {
      ...config.alias,
      ...Object.fromEntries(
        WORKSPACE_PACKAGES.flatMap((item) =>
          Object.entries(item.entries).map(([entry, file]) => [
            '@filumo/' +
              item.name +
              (entry === 'index' ? '' : '/' + entry) +
              '$',
            resolve(root, 'packages', item.name, file),
          ]),
        ),
      ),
    },
    extraBabelIncludes: [...(config.extraBabelIncludes ?? []), ...sources],
  }));

  api.chainWebpack((config, { webpack }) => {
    // 仅跳过 Babel 转换，仍由 Webpack 解析 Worker 和静态 URL 资源依赖。
    for (const name of ['src', 'extra-src'])
      config.module
        .rule(name)
        .exclude.add(pdfGeneratedPattern)
        .add(archiveGeneratedPattern);
    if (config.plugins.has('fastRefresh'))
      config.plugin('fastRefresh').tap(([options = {}, ...rest]) => [
        {
          ...options,
          // 显式设置 exclude 后插件不再补默认值，因此一并保留依赖目录排除。
          exclude: [
            ...(Array.isArray(options.exclude)
              ? options.exclude
              : [options.exclude ?? /node_modules/i]),
            pdfGeneratedPattern,
            archiveGeneratedPattern,
          ],
        },
        ...rest,
      ]);
    // 包样式使用同一租约机制，热更新不能留下旧声明或绕过 CSP nonce。
    const styleRule = config.module.rule('filumo-source-less');
    styleRule
      .test(/\.less$/)
      .type('javascript/auto')
      .sideEffects(true);
    for (const source of styleSources) {
      styleRule.include.add(source);
      config.module.rule('less').exclude.add(source);
    }
    styleRule
      .use('filumo-source-less')
      .loader(resolve(api.cwd, 'server/source-less-loader.cjs'))
      .options({ root });
    config
      .plugin('filumo-source-worker')
      .use(webpack.NormalModuleReplacementPlugin, [
        /^\.\/worker\.js$/,
        (resource: { context: string; request: string }) => {
          // 只替换各格式描述符的内置入口，保留调用方自定义 Worker 的能力。
          const item = WORKSPACE_PACKAGES.find(
            (entry) =>
              entry.workerEntry &&
              resolve(resource.context) ===
                resolve(root, 'packages', entry.name, 'src'),
          );
          if (item?.workerEntry)
            resource.request = resolve(
              root,
              'packages',
              item.name,
              item.workerEntry,
            );
        },
      ]);
    return config;
  });

  api.addBeforeMiddlewares(() => [
    (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      const path = withDocsBase(api.config.base, '__filumo_dev/source-events');
      if (request.url?.split('?')[0] !== path) return next();
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      response.write('retry: 1000\n\n');
      clients.add(response);
      // 保持空闲连接，避免调试代理在下一次源码保存前关闭通知通道。
      const heartbeat = setInterval(
        () => response.write(': keep-alive\n\n'),
        15000,
      );
      heartbeat.unref();
      response.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(response);
      });
    },
  ]);
  api.addEntryCode(
    () => `
    if (typeof EventSource !== 'undefined') {
      const events = new EventSource(${JSON.stringify(
        withDocsBase(api.config.base, '__filumo_dev/source-events'),
      )});
      events.addEventListener('filumo-source-update', () => {
        events.close();
        window.location.reload();
      });
      if (module.hot) module.hot.dispose(() => events.close());
    }
  `,
  );
  api.onDevCompileDone(({ stats, isFirstCompile }: DevCompileResult) => {
    // 原生视图和解析器不属于 React 状态，成功编译后统一重建，失败时保留错误现场。
    for (const file of stats.compilation.compiler.modifiedFiles ?? []) {
      const path = resolve(file);
      if (
        /\.[cm]?[jt]sx?$/.test(path) &&
        sources.some((source) => path.startsWith(source + sep))
      )
        pendingReload = true;
    }
    if (isFirstCompile) {
      pendingReload = false;
      return;
    }
    if (stats.hasErrors() || !pendingReload) return;
    pendingReload = false;
    for (const client of clients)
      client.write('event: filumo-source-update\ndata: reload\n\n');
  });
};
