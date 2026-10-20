import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { collectStaticInputs } from '../../scripts/testing/consumer-graph.mjs';
import { WORKSPACE_PACKAGES } from '../../scripts/workspace-packages.js';

test('图片/PDF 描述符入口没有引擎、样式或 DOM 视图的静态依赖', async () => {
  for (const name of ['image', 'pdf']) {
    const result = await build({
      entryPoints: [`packages/${name}/src/index.ts`],
      bundle: true,
      splitting: true,
      outdir: 'tmp/not-written',
      write: false,
      format: 'esm',
      platform: 'browser',
      packages: 'external',
      metafile: true,
      loader: { '.less': 'empty' },
    });
    const entry = Object.keys(result.metafile.outputs).find((path) =>
      result.metafile.outputs[path].entryPoint?.endsWith('/src/index.ts'),
    );
    assert.ok(entry);
    const inputs = [...collectStaticInputs(result.metafile, entry)];
    assert.equal(
      inputs.some((path) =>
        /\/runtime\/|\/view\/|\.less$|pdfjs-dist/.test(path),
      ),
      false,
      inputs.join('\n'),
    );
  }
});
test('十五包声明依赖保持 image 与 Office 单向，PDF 仅增加必要引擎', async () => {
  assert.equal(WORKSPACE_PACKAGES.length, 15);
  const image = JSON.parse(
      await readFile('packages/image/package.json', 'utf8'),
    ),
    pdf = JSON.parse(await readFile('packages/pdf/package.json', 'utf8')),
    office = JSON.parse(await readFile('packages/office/package.json', 'utf8'));
  assert.equal(image.dependencies['@fivo/office'], undefined);
  assert.equal(office.dependencies['@fivo/image'], 'workspace:^');
  assert.equal(pdf.dependencies['pdfjs-dist'], '6.4.299');
  assert.equal(
    Object.keys(pdf.dependencies).some((name) => /react|vue/.test(name)),
    false,
  );
  assert.equal(
    resolve(image.exports['./view'].import).endsWith('dist/view.js'),
    true,
  );
});

test('公共大纲只进入相关懒加载视图，根入口和其他格式不提前加载', async () => {
  for (const name of [
    'dom',
    'office',
    'markdown',
    'pdf',
    'text',
    'image',
    'json',
    'csv',
    'xml',
    'code',
  ]) {
    const result = await build({
      entryPoints: [`packages/${name}/src/index.ts`],
      bundle: true,
      splitting: true,
      outdir: 'tmp/not-written',
      write: false,
      format: 'esm',
      platform: 'browser',
      packages: 'external',
      metafile: true,
      loader: { '.less': 'empty' },
      plugins: [
        {
          name: 'exact-workspace-entries',
          setup(builder) {
            builder.onResolve({ filter: /^@fivo\// }, ({ path }) => {
              const [, packageName, entry = 'index'] = path.split('/');
              const definition = WORKSPACE_PACKAGES.find(
                (item) => item.name === packageName,
              );
              const file = definition?.entries[entry];
              if (file) return { path: resolve('packages', packageName, file) };
            });
          },
        },
      ],
    });
    const entry = Object.keys(result.metafile.outputs).find((file) =>
      result.metafile.outputs[file].entryPoint?.endsWith(
        `packages/${name}/src/index.ts`,
      ),
    );
    assert.ok(entry);
    const isOutline = (file) =>
      /packages\/dom\/src\/outline(?:\/|\.ts$)/.test(
        file.replaceAll('\\', '/'),
      );
    assert.equal(
      [...collectStaticInputs(result.metafile, entry)].some(isOutline),
      false,
      name,
    );
    const all = Object.values(result.metafile.outputs).flatMap((output) =>
      Object.entries(output.inputs)
        .filter(([, value]) => value.bytesInOutput > 0)
        .map(([file]) => file),
    );
    assert.equal(
      all.some(isOutline),
      ['office', 'markdown', 'pdf', 'xml'].includes(name),
      name,
    );
  }
});
