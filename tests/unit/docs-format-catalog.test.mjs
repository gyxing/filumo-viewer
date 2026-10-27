import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import prettier from 'prettier';
import { formatCatalogMarkdown } from '../../scripts/docs/format-catalog-markdown.mjs';

const catalogBundle = await build({
  entryPoints: ['apps/docs/src/components/format-catalog.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  metafile: true,
});
const { FORMAT_CATALOG } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(catalogBundle.outputFiles[0].text).toString('base64')
);
const ids = [
  'office',
  'pdf',
  'image',
  'text',
  'json',
  'markdown',
  'csv',
  'xml',
  'code',
  'archive',
];
const descriptorsBundle = await build({
  stdin: {
    contents:
      ids
        .map((id) => `import {${id}} from './packages/${id}/src/descriptor';`)
        .join('\n') +
      `\nexport const descriptors = [${ids
        .map((id) => id + '()')
        .join(',')}];` +
      "\nexport {detectCodeLanguage} from './packages/code/src/fileTypes';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'descriptors-only',
      setup(builder) {
        // 核对注册元数据即可；测试不触发解析器、视图或 Worker 的动态加载。
        builder.onResolve({ filter: /.*/ }, (args) =>
          args.kind === 'dynamic-import'
            ? { path: args.path, external: true }
            : undefined,
        );
      },
    },
  ],
});
const { descriptors, detectCodeLanguage } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(descriptorsBundle.outputFiles[0].text).toString('base64')
);

test('公开清单覆盖标准预设中的每个插件及全部默认扩展名', async () => {
  const source = ts.createSourceFile(
    'preset.ts',
    await readFile('packages/viewer/src/index.ts', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => item.name.getText(source) === 'standardPlugins');
  const preset = declaration.initializer.arguments[0].elements.map((item) =>
    item.expression.getText(source),
  );
  assert.deepEqual(
    FORMAT_CATALOG.map((entry) => entry.id).sort(),
    [...preset].sort(),
  );
  for (const descriptor of descriptors) {
    const entry = FORMAT_CATALOG.find(
      (item) => item.id === descriptor.document.id,
    );
    const extensions = entry.groups.flatMap((group) => group.extensions);
    assert.equal(
      new Set(extensions).size,
      extensions.length,
      entry.id + ' 的后缀重复',
    );
    assert.deepEqual(
      [...extensions].sort(),
      [...descriptor.document.extensions].sort(),
      entry.id,
    );
  }
  assert.ok(
    Object.keys(catalogBundle.metafile.inputs).every(
      (file) => !/packages\/|node_modules/.test(file),
    ),
  );
});

test('代码清单包含全部完整文件名及变体，专用格式仍优先', async () => {
  const source = ts.createSourceFile(
    'fileTypes.ts',
    await readFile('packages/code/src/fileTypes.ts', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => item.name.getText(source) === 'codeFileNames');
  const names = declaration.initializer.properties.map(
    (item) => item.name.text,
  );
  const entry = FORMAT_CATALOG.find((item) => item.id === 'code');
  const documented = entry.groups.flatMap((group) => group.fileNames ?? []);
  assert.deepEqual(
    documented.map((name) => name.toLowerCase()).sort(),
    names.sort(),
  );
  for (const name of documented) assert.ok(detectCodeLanguage(name), name);
  const patterns = entry.groups.flatMap((group) => group.patterns ?? []);
  assert.deepEqual(patterns.sort(), ['.env.*', 'Dockerfile.*'].sort());
  assert.equal(detectCodeLanguage('Dockerfile.dev'), 'dockerfile');
  assert.equal(detectCodeLanguage('.env.production'), 'dotenv');
  assert.equal(detectCodeLanguage('Dockerfile.xml'), undefined);
  assert.equal(detectCodeLanguage('.env.json'), undefined);
});

test('中英文指南的完整格式与代码表格均与共享清单一致', async () => {
  for (const [suffix, locale] of [
    ['', 'en-US'],
    ['.zh-CN', 'zh-CN'],
  ]) {
    for (const [file, marker, entries] of [
      ['compatibility', 'format', FORMAT_CATALOG],
      [
        'text-formats',
        'code',
        FORMAT_CATALOG.filter((entry) => entry.id === 'code'),
      ],
    ]) {
      const source = await readFile(
        `apps/docs/docs/guides/${file}${suffix}.md`,
        'utf8',
      );
      const body = source
        .replaceAll('\r\n', '\n')
        .match(
          new RegExp(
            `<!-- filumo-${marker}-catalog:start -->\\n([\\s\\S]*?)\\n<!-- filumo-${marker}-catalog:end -->`,
          ),
        )?.[1];
      assert.equal(
        prettier.format(body ?? '', {parser:'markdown',proseWrap:'preserve'}),
        prettier.format(formatCatalogMarkdown(entries, locale), {parser:'markdown',proseWrap:'preserve'}),
        file + '/' + locale,
      );
    }
  }
});

const docsRequire = createRequire(resolve('apps/docs/package.json'));
const componentBundle = await build({
  stdin: {
    contents: `export {FormatCatalog} from './apps/docs/src/components/FormatCatalog';
      export {SupportedFormatsSection} from './apps/docs/src/components/HomeProductSections';
      export {getWebsiteContent} from './apps/docs/src/components/home-content';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  loader: { '.less': 'empty' },
  metafile: true,
});
const componentModule = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  componentBundle.outputFiles[0].text,
)(docsRequire, componentModule, componentModule.exports);
const React = docsRequire('react');
const { renderToStaticMarkup } = docsRequire('react-dom/server');

test('首页完整清单在两种语言下直接呈现全部后缀和文件名，不依赖引擎或交互展开', () => {
  for (const locale of ['en-US', 'zh-CN']) {
    const html = renderToStaticMarkup(
      React.createElement(componentModule.exports.FormatCatalog, { locale }),
    );
    for (const entry of FORMAT_CATALOG) {
      assert.ok(html.includes(entry.label[locale]));
      assert.ok(html.includes('@filumo/' + entry.id));
      assert.ok(entry.note[locale]);
      for (const group of entry.groups) {
        assert.ok(group.label[locale]);
        for (const value of [
          ...group.extensions,
          ...(group.fileNames ?? []),
          ...(group.patterns ?? []),
        ])
          assert.ok(
            html.includes('<code>' + value + '</code>'),
            value + '/' + locale,
          );
      }
    }
    assert.ok(!/<(?:button|details|input|script)\b/.test(html));
    const section = renderToStaticMarkup(
      React.createElement(componentModule.exports.SupportedFormatsSection, {
        content: componentModule.exports.getWebsiteContent(locale),
      }),
    );
    assert.equal(
      (section.match(/office-viewer-site-format-card is-/g) ?? []).length,
      10,
    );
    assert.equal((section.match(/id="format-catalog"/g) ?? []).length, 1);
    assert.ok(section.includes('href="#format-catalog"'));
  }
  assert.ok(
    Object.keys(componentBundle.metafile.inputs).every(
      (file) => !/packages\/|node_modules/.test(file),
    ),
  );
});
