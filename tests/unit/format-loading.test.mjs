import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { collectStaticInputs } from '../../scripts/testing/consumer-graph.mjs';

test('格式检测尊重后缀身份，描述符不读取全文或创建 Worker', async () => {
  const [{ text }, { json }, { markdown }] = await Promise.all([
    import('../../packages/text/dist/index.js'),
    import('../../packages/json/dist/index.js'),
    import('../../packages/markdown/dist/index.js'),
  ]);
  let reads = 0,
    workers = 0;
  const factory = () => {
    workers++;
    throw Error('注册阶段不应创建');
  };
  const plain = text({ workerFactory: factory }),
    structured = json({ workerFactory: factory }),
    reading = markdown({ workerFactory: factory });
  const source = (name) => ({
    name,
    mimeType: 'text/plain',
    async readAll() {
      reads++;
      return new TextEncoder().encode('{}');
    },
    async dispose() {},
  });
  const signal = new AbortController().signal;
  assert.equal(await plain.document.detect(source('a.txt'), signal), true);
  assert.equal(await plain.document.detect(source('a.custom'), signal), false);
  assert.equal(await plain.document.detect(source(''), signal), false);
  assert.equal(text({ fallback: false }).document.detectFallback, undefined);
  assert.equal(
    await structured.document.detect(source('a.txt'), signal),
    false,
  );
  for (const name of ['a.json', 'a.md', 'a.docx'])
    assert.equal(await plain.document.detect(source(name), signal), false);
  assert.equal(
    await structured.document.detect(source('a.json'), signal),
    true,
  );
  assert.equal(await reading.document.detect(source('a.md'), signal), true);
  assert.equal(reads, 0);
  assert.equal(workers, 0);
});

test('标准描述符静态闭包不包含格式引擎、样式、Worker 或高亮', async () => {
  const result = await build({
    entryPoints: ['packages/viewer/dist/index.js'],
    bundle: true,
    write: false,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    outdir: 'tmp/testing/format-loading',
    metafile: true,
  });
  const entry = Object.keys(result.metafile.outputs).find(
    (file) =>
      result.metafile.outputs[file].entryPoint ===
      'packages/viewer/dist/index.js',
  );
  const initial = [...collectStaticInputs(result.metafile, entry)];
  assert.equal(
    initial.some((file) =>
      /(?:\/parser\/|\/view\/|\/runtime\/|marked[\/\\]|highlight\.js[\/\\]|\.less$)/.test(
        file,
      ),
    ),
    false,
    initial.join('\n'),
  );
  for (const name of ['text', 'json', 'markdown', 'csv', 'xml', 'code']) {
    const manifest = JSON.parse(
      await readFile(`packages/${name}/dist/build-manifest.json`, 'utf8'),
    );
    const forbidden = manifest.outputs.filter((output) =>
      output.inputs.some((input) =>
        /^src\/(?:runtime|view|parser|reader|worker|highlight)\/|\.less$/.test(
          input,
        ),
      ),
    );
    const eager = new Set(initial.map((file) => resolve(file)));
    assert.deepEqual(
      forbidden
        .filter((output) =>
          eager.has(resolve(`packages/${name}/dist`, output.file)),
        )
        .map((output) => output.file),
      [],
      name,
    );
  }
});

test('单格式根入口与读取入口不会带入其他格式实现', async () => {
  for (const [name, entry] of [
    ['text', 'index'],
    ['text', 'reader'],
    ['json', 'index'],
  ]) {
    const result = await build({
      entryPoints: [`packages/${name}/dist/${entry}.js`],
      bundle: true,
      write: false,
      splitting: true,
      format: 'esm',
      platform: 'node',
      outdir: 'tmp/testing/isolated-format',
      metafile: true,
    });
    const files = Object.keys(result.metafile.inputs);
    assert.equal(
      files.some((file) =>
        /packages[\\/]markdown[\\/]|node_modules.*(?:marked|highlight\.js)/.test(
          file,
        ),
      ),
      false,
      files.join('\n'),
    );
    if (entry === 'reader') {
      const dom = JSON.parse(
        await readFile('packages/dom/dist/build-manifest.json', 'utf8'),
      );
      const pureMessages = new Set(
        dom.outputs
          .filter(
            (output) =>
              output.inputs.length &&
              output.inputs.every((input) =>
                [
                  'src/text-messages.ts',
                  'src/text/formatEncodingWarning.ts',
                ].includes(input),
              ),
          )
          .map((output) => resolve('packages/dom/dist', output.file)),
      );
      assert.equal(
        files.some(
          (file) =>
            /\.less$/.test(file) ||
            (/packages[\\/]dom[\\/]/.test(file) &&
              !pureMessages.has(resolve(file))),
        ),
        false,
        files.join('\n'),
      );
    }
  }
});

test('新 Worker 保持 JSON 和 Markdown 解析动态边界', async () => {
  for (const name of ['json', 'markdown', 'csv', 'xml', 'code']) {
    const manifest = JSON.parse(
      await readFile('packages/' + name + '/dist/build-manifest.json', 'utf8'),
    );
    const initial = [
      ...collectStaticInputs({ outputs: manifest.worker.graph }, 'worker.js'),
    ];
    assert.equal(
      initial.some((file) =>
        /src\/(?:parser|highlight)\/|node_modules.*(?:marked|saxes|highlight\.js)/.test(
          file,
        ),
      ),
      false,
      initial.join('\n'),
    );
  }
});

test('Text 和 JSON 不声明 Markdown 运行时依赖', async () => {
  for (const name of ['text', 'json']) {
    const manifest = JSON.parse(
      await readFile('packages/' + name + '/package.json', 'utf8'),
    );
    assert.equal(manifest.dependencies.marked, undefined);
    assert.equal(manifest.dependencies['highlight.js'], undefined);
    assert.equal(manifest.dependencies['@fivo/markdown'], undefined);
  }
});

test('JSON 独立代码区静态闭包不包含结构树或结构扫描器', async () => {
  const manifest = JSON.parse(
    await readFile('packages/json/dist/build-manifest.json', 'utf8'),
  );
  const source = manifest.outputs.find((output) =>
    output.inputs.includes('src/view/JsonSource.ts'),
  );
  assert.ok(source, '必须存在实际代码区输入映射');
  const entryPath = `packages/json/dist/${source.file}`;
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    splitting: true,
    format: 'esm',
    platform: 'node',
    outdir: 'tmp/testing/json-source-graph',
    metafile: true,
  });
  const entry = Object.keys(result.metafile.outputs).find(
    (file) => result.metafile.outputs[file].entryPoint === entryPath,
  );
  const initial = new Set(
    [...collectStaticInputs(result.metafile, entry)].map((file) =>
      resolve(file),
    ),
  );
  const forbidden = manifest.outputs.filter((output) =>
    output.inputs.some((input) =>
      /src\/view\/JsonTree\.ts|src\/parser\/scanJson\.ts/.test(input),
    ),
  );
  assert.deepEqual(
    forbidden
      .filter((output) =>
        initial.has(resolve('packages/json/dist', output.file)),
      )
      .map((output) => output.file),
    [],
  );
});
