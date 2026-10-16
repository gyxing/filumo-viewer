import type { IApi } from 'dumi';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve, sep } from 'node:path';
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
  const packages = ['core', 'dom', 'office', 'react', 'vue', 'vue2', 'viewer'];
  const sources = packages.map((name) => resolve(root, 'packages', name, 'src'));
  const officeSource = resolve(root, 'packages/office/src');
  const clients = new Set<ServerResponse>();
  let pendingReload = false;

  api.modifyConfig((config) => ({
    ...config,
    mfsu: false,
    alias: {
      ...config.alias,
      ...Object.fromEntries(
        packages.map((name, index) => [
          '@fivo/' + name + '$',
          resolve(sources[index], 'index.ts'),
        ]),
      ),
    },
    extraBabelIncludes: [...(config.extraBabelIncludes ?? []), ...sources],
  }));

  api.chainWebpack((config, { webpack }) => {
    // 先补上与发布构建一致的作用域，再复用 dumi 的 Less 编译和样式热替换。
    const styleRule = config.module.rule('fivo-source-less');
    styleRule.test(/\.less$/).enforce('pre');
    styleRule.include.add(resolve(root, 'packages/dom/src')).add(officeSource);
    styleRule
      .use('fivo-source-less')
      .loader(resolve(api.cwd, 'server/source-less-loader.cjs'))
      .options({ root });
    config.plugin('fivo-source-worker').use(webpack.NormalModuleReplacementPlugin, [
      /^\.\/worker\.js$/,
      (resource: { context: string; request: string }) => {
        // 只替换 Office 描述符的内置入口，保留调用方自定义 Worker 的能力。
        if (resolve(resource.context) === officeSource)
          resource.request = resolve(
            officeSource,
            'engine/parsing/runtime/worker/entry.js',
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
  api.addEntryCode(() => `
    if (typeof EventSource !== 'undefined') {
      const events = new EventSource(${JSON.stringify(withDocsBase(api.config.base, '__fivo_dev/source-events'))});
      events.addEventListener('fivo-source-update', () => {
        events.close();
        window.location.reload();
      });
      if (module.hot) module.hot.dispose(() => events.close());
    }
  `);
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
