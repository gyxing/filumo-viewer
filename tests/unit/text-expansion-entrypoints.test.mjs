import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { WORKSPACE_PACKAGES } from '../../scripts/workspace-packages.js';
import { collectStaticInputs } from '../../scripts/testing/consumer-graph.mjs';
test('新增格式依赖公共层且描述符不提前加载引擎或视图', async () => {
  assert.equal(WORKSPACE_PACKAGES.length, 15);
  for (const name of ['csv', 'xml', 'code', 'json', 'markdown']) {
    const metadata = JSON.parse(
      await readFile(`packages/${name}/package.json`, 'utf8'),
    );
    assert.equal(metadata.dependencies['@filumo/text'], undefined);
    assert.equal(metadata.dependencies['@filumo/core'], 'workspace:^');
    assert.equal(metadata.dependencies['@filumo/dom'], 'workspace:^');
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
    const output = Object.keys(result.metafile.outputs).find(
      // 动态分块也有 entryPoint，必须按源码身份选中真正的根入口。
      (file) => resolve(result.metafile.outputs[file].entryPoint ?? '') ===
        resolve(`packages/${name}/src/index.ts`),
    );
    assert.ok(output, name + ' 缺少描述符根入口');
    const inputs = [...collectStaticInputs(result.metafile, output)];
    assert.equal(
      inputs.some((file) =>
        /\/(?:view|parser|runtime|highlight)\/|highlight\.js|saxes|marked|\.less$/.test(
          file.replaceAll('\\', '/'),
        ),
      ),
      false,
      name + '\n' + inputs.join('\n'),
    );
  }
});
test('无 document 环境可仅导入公共文本和拖柄入口', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  for (const [name, entry] of [
    ['core', 'text'],
    ['dom', 'text'],
    ['dom', 'text-messages'],
    ['dom', 'text-highlight'],
    ['dom', 'split'],
  ]) {
    const { pathToFileURL } = await import('node:url');
    const api = await import(
      pathToFileURL(resolve(`packages/${name}/dist/${entry}.js`))
    );
    assert.ok(Object.keys(api).length > 0);
  }
});

test('CSV、XML、Code 工厂在 SSR 中创建描述符不访问 Worker', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const { pathToFileURL } = await import('node:url');
  for (const name of ['csv', 'xml', 'code']) {
    const api = await import(
      pathToFileURL(resolve(`packages/${name}/dist/index.js`))
    );
    const plugin = api[name]();
    assert.equal(plugin.document.id, name);
    assert.equal(plugin.document.protocolVersion, 1);
    assert.equal(typeof plugin.loadView, 'function');
  }
});
