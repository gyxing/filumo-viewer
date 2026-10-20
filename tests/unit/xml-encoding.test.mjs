import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/xml/src/runtime/xmlEncodingHint.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { xmlEncodingHint } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('XML 声明支持常见编码且只读取前 4 KiB', () => {
  assert.equal(
    xmlEncodingHint(
      new TextEncoder().encode('<?xml version="1.0" encoding="GBK"?><r/>'),
    ),
    'gbk',
  );
  assert.equal(
    xmlEncodingHint(
      new TextEncoder().encode(' '.repeat(4096) + '<?xml encoding="GBK"?>'),
    ),
    undefined,
  );
  const utf16 = new Uint8Array(
    Buffer.from('<?xml version="1.0" encoding="UTF-16"?><r/>', 'utf16le'),
  );
  assert.equal(xmlEncodingHint(utf16), 'utf-16le');
  const bigEndian = new Uint8Array(utf16.length);
  for (let i = 0; i < utf16.length; i += 2) {
    bigEndian[i] = utf16[i + 1];
    bigEndian[i + 1] = utf16[i];
  }
  assert.equal(xmlEncodingHint(bigEndian), 'utf-16be');
});
