import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { normalizeDocsBase } from '../../apps/docs/config/base-path.js';

const bundle = await build({
  stdin: {
    contents: `export * from './apps/docs/config/doc-pages';
    export * from './apps/docs/src/components/documentation-links';
    export * from './apps/docs/src/components/documentation-seo';
    export * from './apps/docs/src/components/documentation-tree';
    export * from './apps/docs/config/read-package-versions';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const app = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('同一注册表覆盖六组目录、双语页面和上下篇，所有 Markdown 均存在', async () => {
  assert.equal(app.DOC_GROUPS.length, 6);
  for (const locale of ['en-US', 'zh-CN']) {
    const pages = app.getDocumentationPages(locale);
    assert.equal(new Set(pages.map((page) => page.route)).size, pages.length);
    for (const [index, page] of pages.entries()) {
      await readFile(
        'apps/docs/docs/' +
          page.file +
          (locale === 'en-US' ? '.md' : '.zh-CN.md'),
        'utf8',
      );
      const links = app.documentationNeighbors(page.route, locale);
      assert.equal(links.previous?.route, pages[index - 1]?.route);
      assert.equal(links.next?.route, pages[index + 1]?.route);
    }
  }
});

test('语言切换映射同序章节，保留共享锚点，丢弃失效或非法锚点', () => {
  const en = [{ id: 'encoding', title: 'Encoding', depth: 2 }];
  const zh = [{ id: '编码', title: '编码', depth: 2 }];
  assert.equal(
    app.translateDocumentationHash('#encoding', en, zh),
    '#' + encodeURIComponent('编码'),
  );
  assert.equal(
    app.translateDocumentationHash('#encoding', en, en),
    '#encoding',
  );
  assert.equal(app.translateDocumentationHash('#missing', en, zh), '');
  assert.equal(app.translateDocumentationHash('#%broken', en, zh), '');
  assert.equal(
    app.legacyDocumentationTarget('/zh-CN/docs', '#viewer-options'),
    '/zh-CN/docs/guides/viewer-api#viewer-options',
  );
  assert.equal(
    app.legacyDocumentationTarget('/docs/guides/viewer-api', '#viewer-options'),
    undefined,
  );
  assert.equal(
    app.sharedDocumentationAnchor('/docs/guides/viewer-api', '#development'),
    false,
  );
  assert.equal(
    app.sharedDocumentationAnchor('/docs/guides/testing', '#development'),
    true,
  );
  assert.equal(
    app.legacyDocumentationHeading(
      '/docs',
      '#encoding',
      [],
      '/docs/guides/viewer-api',
      en,
    ),
    '/docs/guides/viewer-api#encoding',
  );
});

test('分组目录保留实际层级和当前章节，折叠时选中可见祖先', () => {
  const pages = [
    { route: '/docs/api', href: '/docs/api', title: 'API', group: 'api' },
  ];
  const model = app.buildDocumentationTree(
    pages,
    '/docs/api',
    [{ id: 'options', title: 'Options', depth: 2 }],
    [{ id: 'api', title: 'API reference' }],
  );
  assert.equal(model.nodes[0].kind, 'group');
  assert.equal(model.nodes[0].children[0].depth, 1);
  assert.equal(model.headings[0].depth, 2);
  assert.deepEqual(
    app.getDocumentationAncestors(model, 'page:/docs/api#options'),
    ['group:api', 'page:/docs/api'],
  );
  assert.equal(
    app.getVisibleDocumentationKey(model, 'page:/docs/api#options', []),
    'group:api',
  );
});

test('canonical、双语替代和 sitemap 保留部署目录，只包含公开白名单', () => {
  for (const base of ['/', '/filumo-viewer/', '/nested/docs/']) {
    const metadata = app.documentationSeo(
      '/zh-CN/docs/guides/viewer-api',
      base,
      'https://example.com',
    );
    assert.equal(
      metadata.en,
      'https://example.com' + base + 'docs/guides/viewer-api',
    );
    assert.equal(metadata.canonical, metadata.zh);
    assert.equal(app.documentationRoute(base + 'zh-CN/docs/', base), '/docs');
    const xml = app.documentationSitemap(base, 'https://example.com');
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    );
    assert.equal(new Set(urls).size, urls.length);
    assert.ok(
      urls.every((url) => url.startsWith('https://example.com' + base)),
    );
    assert.ok(!/smoke-test|__filumo_smoke|~demos/.test(xml));
    assert.ok(xml.includes('hreflang="zh-CN"'));
  }
  for (const origin of [
    'javascript:alert(1)',
    'https://user:secret@example.com',
    'https://example.com/project/',
  ])
    assert.throws(() => app.documentationSeo('/docs', '/', origin));
});

test('版本信息读取每个包 manifest，不依赖固定版本或推断 npm 状态', async () => {
  const versions = app.readPackageVersions(process.cwd());
  assert.equal(Object.keys(versions).length, 15);
  const manifest = JSON.parse(
    await readFile('packages/viewer/package.json', 'utf8'),
  );
  assert.equal(versions[manifest.name], manifest.version);
  const runtime = await build({
    entryPoints: ['apps/docs/src/components/documentation-release.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    define: {
      'process.env.FILUMO_DOCS_VERSIONS': JSON.stringify(
        JSON.stringify({ ...versions, '@filumo/viewer': '9.9.9' }),
      ),
    },
  });
  const info = await import(
    'data:text/javascript;base64,' +
      Buffer.from(runtime.outputFiles[0].text).toString('base64')
  );
  assert.equal(info.DOCUMENTATION_BASELINE, '9.9.9');
});

test('插件 API 覆盖每个公开工厂的全部顶层参数，两种语言均有完整字段', async () => {
  for (const suffix of ['', '.zh-CN']) {
    const markdown = await readFile(
      'apps/docs/docs/guides/plugin-api' + suffix + '.md',
      'utf8',
    );
    for (const id of [
      'office',
      'image',
      'pdf',
      'text',
      'json',
      'markdown',
      'csv',
      'xml',
      'code',
    ]) {
      const source = ts.createSourceFile(
        'options.ts',
        await readFile('packages/' + id + '/src/options.ts', 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const declaration = source.statements.find(
        (node) =>
          ts.isInterfaceDeclaration(node) &&
          node.name.text.toLowerCase() ===
            (id === 'office' ? 'officeoptions' : id + 'options'),
      );
      const section = markdown
        .split('## ' + id + ' · @filumo/' + id)[1]
        ?.split('\n## ')[0];
      assert.ok(section, id);
      for (const member of declaration.members)
        assert.ok(
          section.includes('| `' + member.name.text + '` |'),
          id + '/' + member.name.text,
        );
    }
  }
});

test('搜索入口没有静态导入索引或弹窗，原生 Tree 仍使用 showLine', async () => {
  const search = await readFile(
    'apps/docs/src/components/DocumentationSearch.tsx',
    'utf8',
  );
  assert.ok(search.includes("import('./DocumentationSearchDialog')"));
  assert.ok(!/^import\s+(?!type\b).*from ['"]dumi['"]/m.test(search));
  const nav = await readFile(
    'apps/docs/src/components/DocumentationNav.tsx',
    'utf8',
  );
  assert.ok(nav.includes('<Tree'));
  assert.ok(nav.includes('showLine'));
  assert.ok(!/switcherIcon|titleRender/.test(nav));
});

test('页脚品牌遵循语言，编辑链接和上下篇指向真实双语页面', async () => {
  const output = await build({
    stdin: {
      contents: `export {SiteFooter} from './apps/docs/src/components/SiteFooter';
      export {DocumentationPageFooter} from './apps/docs/src/components/DocumentationPageFooter';
      export {getWebsiteContent} from './apps/docs/src/components/home-content';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
  });
  const require = createRequire(resolve('apps/docs/package.json'));
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(
    require,
    module,
    module.exports,
  );
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const footer = renderToStaticMarkup(
    React.createElement(module.exports.SiteFooter, {
      content: module.exports.getWebsiteContent('zh-CN'),
    }),
  );
  assert.ok(
    footer.includes(
      'href="' + normalizeDocsBase(process.env.FILUMO_DOCS_BASE) + 'zh-CN/"',
    ),
  );
  const page = renderToStaticMarkup(
    React.createElement(module.exports.DocumentationPageFooter, {
      pathname: '/zh-CN/docs/guides/viewer-api',
      locale: 'zh-CN',
    }),
  );
  assert.ok(
    page.includes('/edit/master/apps/docs/docs/guides/viewer-api.zh-CN.md'),
  );
  assert.ok(page.includes('文档上下篇'));
  assert.ok(page.includes('/zh-CN/docs/guides/plugin-api'));
});
