import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createViewerPackageContract,
  rewriteViewerImports,
} from '../../scripts/build/viewer-distribution.mjs';

const manifests = {
  dom: {
    name: '@filumo/dom',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        default: './dist/index.js',
      },
      './grid': { types: './dist/grid.d.ts', import: './dist/grid.js' },
      './styles.css': './dist/styles.css',
      './package.json': './package.json',
    },
    sideEffects: ['**/*.css'],
  },
  pdf: {
    name: '@filumo/pdf',
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      './assets': { types: './dist/assets.d.ts', import: './dist/assets.js' },
      './assets/*': './dist/assets/*',
    },
    dependencies: {
      '@filumo/dom': 'workspace:^',
      'pdfjs-dist': '6.4.299',
      saxes: '^6.0.0',
    },
    sideEffects: ['./dist/chunks/*.js', '**/*.css'],
  },
  office: {
    name: '@filumo/office',
    exports: {
      '.': { types: './dist/types/index.d.ts', import: './dist/index.js' },
    },
    dependencies: { saxes: '6.0.0' },
  },
};

test('统一包派生子入口和资源合同，仅运行依赖保留第三方包', () => {
  const result = createViewerPackageContract(manifests);
  assert.equal(result.exports['./pdf/assets/*'], './dist/modules/pdf/assets/*');
  assert.equal(
    result.exports['./office'].types,
    './dist/modules/office/types/index.d.ts',
  );
  assert.equal(
    result.exports['./dom/styles.css'],
    './dist/modules/dom/styles.css',
  );
  assert.equal(result.exports['./dom/package.json'], undefined);
  assert.equal(result.dependencies.saxes, '6.0.0');
  assert.equal(result.dependencies['pdfjs-dist'], '6.4.299');
  assert.equal(result.dependencies['@filumo/dom'], undefined);
  assert.equal(result.devDependencies['@filumo/dom'], 'workspace:^');
  assert.ok(result.sideEffects.includes('./dist/modules/pdf/chunks/*.js'));
  assert.equal(result.peerDependenciesMeta.vue.optional, true);
});

test('统一包拒绝不兼容的第三方版本与模块导出越界', () => {
  assert.throws(
    () =>
      createViewerPackageContract({
        ...manifests,
        csv: {
          name: '@filumo/csv',
          exports: {},
          dependencies: { saxes: '5.0.0' },
        },
      }),
    /范围需要明确对齐/,
  );
  assert.throws(
    () =>
      createViewerPackageContract({
        csv: { name: '@filumo/csv', exports: { '.': '../outside.js' } },
      }),
    /超出 dist/,
  );
});

test('模块转换覆盖静态导入、转导出、动态资源和声明类型，保留普通字符串', () => {
  const output = resolve('tmp/unified/dist');
  const file = resolve(output, 'modules/pdf/chunks/reader.js');
  const source = `import {x} from '@filumo/dom/grid'; export {y} from '@filumo/office';
    const assets=import('@filumo/pdf/assets'); const path=new URL('@filumo/pdf/assets/font.bin',import.meta.url);
    const message='@filumo/dom';`;
  const result = rewriteViewerImports(source, file, output, manifests);
  assert.match(result, /from "\.\.\/\.\.\/dom\/grid.js"/);
  assert.match(result, /from "\.\.\/\.\.\/office\/index.js"/);
  assert.match(result, /import\("\.\.\/assets.js"\)/);
  assert.match(result, /new URL\("\.\.\/assets\/font.bin"/);
  assert.match(result, /message='@filumo\/dom'/);
  const types = rewriteViewerImports(
    `import type {A} from '@filumo/dom'; type B=import('@filumo/office').OfficeOptions;`,
    resolve(output, 'modules/pdf/index.d.ts'),
    output,
    manifests,
  );
  assert.match(types, /from "\.\.\/dom\/index"/);
  assert.match(types, /import\("\.\.\/office\/types\/index"\)/);
});

test('未公开内部入口和资源穿越必须使构建失败', () => {
  const output = resolve('tmp/unified/dist');
  const file = resolve(output, 'index.js');
  assert.throws(
    () =>
      rewriteViewerImports(
        `import '@filumo/pdf/private';`,
        file,
        output,
        manifests,
      ),
    /未公开/,
  );
  assert.throws(
    () =>
      rewriteViewerImports(
        `import '@filumo/missing';`,
        file,
        output,
        manifests,
      ),
    /未知内部模块/,
  );
  assert.throws(
    () =>
      rewriteViewerImports(
        `import '@filumo/pdf/assets/../../../../escape.js';`,
        file,
        output,
        manifests,
      ),
    /越界/,
  );
});
