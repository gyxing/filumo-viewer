import { resolve } from 'node:path';
import { DOC_GUIDES } from './doc-pages';
/** 生产永远不注册本机烟测，不受开发环境变量误传影响。 */
export function getDocsRoutes({
  production,
  smoke,
}: {
  production: boolean;
  smoke: boolean;
}) {
  const docs = resolve(__dirname, '../docs');
  const routes = [
    { path: '/', component: resolve(docs, 'index.md'), layout: false },
    {
      path: '/index/zh-CN',
      component: resolve(docs, 'index.zh-CN.md'),
      layout: false,
    },
    {
      path: '/playground',
      component: resolve(docs, 'playground.md'),
      layout: false,
    },
    {
      path: '/playground/zh-CN',
      component: resolve(docs, 'playground.zh-CN.md'),
      layout: false,
    },
    { path: '/docs', component: resolve(docs, 'docs.md') },
    { path: '/docs/zh-CN', component: resolve(docs, 'docs.zh-CN.md') },
    ...DOC_GUIDES.flatMap(({ slug, file }) => [
      {
        path: '/docs/guides/' + slug,
        component: resolve(docs, 'guides/' + file + '.md'),
      },
      {
        path: '/docs/guides/' + slug + '/zh-CN',
        component: resolve(docs, 'guides/' + file + '.zh-CN.md'),
      },
    ]),
  ];
  if (!production && smoke)
    routes.push({
      path: '/dev/smoke-test',
      component: resolve(docs, 'smoke.md'),
      layout: false,
    });
  return routes;
}
