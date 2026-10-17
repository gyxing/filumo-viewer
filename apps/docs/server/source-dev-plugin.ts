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
            '@fivo/' + item.name + (entry === 'index' ? '' : '/' + entry) + '$',
            resolve(root, 'packages', item.name, file),
          ]),
        ),
      ),
    },
    extraBabelIncludes: [...(config.extraBabelIncludes ?? []), ...sources],
  }));

  api.chainWebpack((config, { webpack }) => {
    // 包样式使用同一租约机制，热更新不能留下旧声明或绕过 CSP nonce。
    const styleRule = config.module.rule('fivo-source-less');
    styleRule
      .test(/\.less$/)
      .type('javascript/auto')
      .sideEffects(true);
    for (const source of styleSources) {
      styleRule.include.add(source);
      config.module.rule('less').exclude.add(source);
    }
    styleRule
      .use('fivo-source-less')
      .loader(resolve(api.cwd, 'server/source-less-loader.cjs'))
      .options({ root });
    config
      .plugin('fivo-source-worker')
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
      const path = withDocsBase(api.config.base, '__fivo_dev/source-events');
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
        withDocsBase(api.config.base, '__fivo_dev/source-events'),
      )});
      events.addEventListener('fivo-source-update', () => {
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
      client.write('event: fivo-source-update\ndata: reload\n\n');
  });
};
