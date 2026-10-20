import { expansionSamples } from '../../tests/fixtures/public/text-expansion/samples.mjs';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadLocalCatalog, resolveSampleFile } from './local-samples.js';
/** 公共夹具与真实本机文件严格分开，消费页面共享同一 ID。 */
export async function sampleCatalog(root, local = false) {
  const result = [];
  for (const format of ['docx', 'xlsx', 'pptx', 'svg', 'pdf'])
    result.push({
      id: 'basic-' + format,
      format,
      absolute: resolve(
        root,
        'tests/fixtures/public/generated/sample.' + format,
      ),
      local: false,
    });
  result.push({
    id: 'word-long-table',
    format: 'docx',
    absolute: resolve(
      root,
      'tests/fixtures/public/generated/sample-complex.docx',
    ),
    local: false,
  });
  for (const [id, format, file] of [
    ['text-utf8', 'txt', 'sample.txt'],
    ['text-log', 'log', 'sample.log'],
    ['text-utf16', 'txt', 'sample-utf16.txt'],
    ['text-gbk', 'txt', 'sample-gbk.txt'],
    ['json-basic', 'json', 'sample.json'],
    ['json-invalid', 'json', 'sample-invalid.json'],
    ['markdown-basic', 'md', 'sample.md'],
    ['pdf-password', 'pdf', 'sample-password.pdf'],
    ['pdf-scan', 'pdf', 'sample-scan.pdf'],
  ])
    result.push({
      id,
      format,
      absolute: resolve(root, 'tests/fixtures/public/generated', file),
      local: false,
    });
  for (const sample of expansionSamples)
    result.push({
      id: sample.id,
      format: sample.format,
      absolute: resolve(root, 'tests/fixtures/public/generated', sample.file),
      local: false,
    });
  if (local) {
    const catalog = await loadLocalCatalog(root);
    for (const id of [
      'links-doc',
      'links-docx',
      'links-xls',
      'links-xlsx',
      'links-ppt',
      'links-pptx',
      'binary-word',
      'binary-sheet',
      'binary-slides',
    ]) {
      const file = await resolveSampleFile(root, id, catalog);
      if (!file) throw Error('缺少样本：' + id);
      result.push({
        id,
        format: file.format,
        absolute: file.absolute,
        local: true,
      });
    }
  }
  return Promise.all(
    result.map(async (item) => {
      const bytes = await readFile(item.absolute);
      return {
        ...item,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }),
  );
}
