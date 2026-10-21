import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { WORKSPACE_PACKAGES } from '../../scripts/workspace-packages.js';

const packages = WORKSPACE_PACKAGES.map((item) => item.name);

test('所有公开包都声明可解析的根入口和类型入口', async () => {
  for (const name of packages) {
    const manifest = JSON.parse(
      await readFile(`packages/${name}/package.json`, 'utf8'),
    );
    const root = manifest.exports['.'];
    assert.equal(typeof root.import, 'string', name);
    assert.equal(typeof root.types, 'string', name);
    await readFile(`packages/${name}/${root.import}`, 'utf8');
    await readFile(`packages/${name}/${root.types}`, 'utf8');
  }
});

test('Text 读取与视图子入口具有独立产物和声明', async () => {
  const manifest = JSON.parse(
    await readFile('packages/text/package.json', 'utf8'),
  );
  for (const name of ['reader', 'view']) {
    await readFile(
      'packages/text/' + manifest.exports['./' + name].import,
      'utf8',
    );
    await readFile(
      'packages/text/' + manifest.exports['./' + name].types,
      'utf8',
    );
  }
});

test('独立消费者脚本直接覆盖 core 和 viewer 入口', async () => {
  const source = await readFile('scripts/testing/check-consumers.mjs', 'utf8');
  assert.match(source, /@filumo\/core/);
  assert.match(source, /@filumo\/viewer/);
});

test('图片公共视图与 PDF 资产子入口具有独立产物', async () => {
  for (const [name, entry] of [
    ['image', 'view'],
    ['pdf', 'assets'],
    ['dom', 'outline'],
    ['core', 'text'],
    ['dom', 'text'],
    ['dom', 'text-messages'],
    ['dom', 'text-highlight'],
    ['dom', 'split'],
  ]) {
    const manifest = JSON.parse(
      await readFile(`packages/${name}/package.json`, 'utf8'),
    );
    for (const field of ['import', 'types'])
      await readFile(
        `packages/${name}/` + manifest.exports['./' + entry][field],
        'utf8',
      );
  }
});

test('公共大纲发布子入口支持没有浏览器全局对象的仅导入', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const api = await import(
    pathToFileURL(resolve('packages/dom/dist/outline.js')).href
  );
  assert.equal(typeof api.OutlineTree, 'function');
  assert.equal(api.OUTLINE_DEFAULTS.rowHeight, 28);
});
