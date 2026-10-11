import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await files(file)));
    else result.push(file);
  }
  return result;
}
test('Office 包无 React/ReactDOM/兼容运行时依赖', async () => {
  const pkg = JSON.parse(
    await readFile('packages/office/package.json', 'utf8'),
  );
  for (const name of Object.keys({
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  }))
    assert.ok(!/^(react|react-dom|preact|inferno)(\/|$)/.test(name));
});
test('Office 生产运行时图和公开声明均无 React', async () => {
  const bundle = await build({
    entryPoints: ['packages/office/src/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    packages: 'external',
    loader: { '.less': 'empty' },
    metafile: true,
    logLevel: 'silent',
  });
  for (const output of Object.values(bundle.metafile.outputs))
    assert.equal(
      output.imports.some((item) =>
        /^(react|react-dom|preact)(\/|$)/.test(item.path),
      ),
      false,
    );
  assert.equal(
    Object.keys(bundle.metafile.inputs).some((file) =>
      /compat[\\/]react|LegacyPreview/.test(file),
    ),
    false,
  );
  const declarations = (await files('packages/office/dist')).filter((file) =>
    file.endsWith('.d.ts'),
  );
  const metadata = JSON.parse(
    await readFile('packages/office/package.json', 'utf8'),
  );
  const typesEntry = path.resolve(
    'packages/office',
    metadata.exports['.'].types,
  );
  const program = ts.createProgram([typesEntry], {
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    target: ts.ScriptTarget.ES2020,
    types: [],
  });
  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
    [],
  );
  assert.ok(
    program
      .getSourceFiles()
      .some((file) => path.resolve(file.fileName) === typesEntry),
  );
  assert.equal(
    program
      .getSourceFiles()
      .some((file) =>
        /office[\\/]dist[\\/](?:src[\\/])?(engine|renderers|runtime)[\\/]/.test(
          file.fileName,
        ),
      ),
    false,
  );
  for (const file of declarations) {
    const text = await readFile(file, 'utf8');
    assert.equal(/from ['"]react(?:-dom)?['"]/.test(text), false);
    assert.equal(text.includes('/legacy/'), false);
  }
});
test('三类默认渲染器全部走原生，无旧入口回退', async () => {
  const text = await readFile(
    'packages/office/src/runtime/selectRenderer.ts',
    'utf8',
  );
  for (const family of ['presentation', 'spreadsheet', 'word'])
    assert.ok(text.includes('/renderers/' + family));
  assert.equal(text.includes('mountLegacy'), false);
});

test('Office 基础 engine 和 view 不反向依赖 renderer', async () => {
  const result = await import('../../scripts/checks/office-boundaries.mjs');
  const audit = await result.auditOffice();
  assert.deepEqual(audit.engineToRenderer, []);
  assert.deepEqual(audit.viewToRenderer, []);
});
