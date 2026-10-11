import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const bundled = await build({
  entryPoints: ['packages/office/src/engine/docx/DocxWordPageSource.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const { DocxWordPageSource } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
const page = {
  width: 794,
  minHeight: 1123,
  marginLeft: 72,
  marginRight: 72,
  marginTop: 72,
  marginBottom: 72,
};
function create(signal) {
  const source = new DocxWordPageSource({
    sessionId: 'materialized-test',
    signal,
  });
  source.setMetadata({ page, preserveSectionPagination: false });
  return source;
}

test('物化 Word 保留预算内表格引用及原始行数', async () => {
  const source = create();
  try {
    const table = {
      id: 'table',
      type: 'table',
      rows: Array.from({ length: 40 }, () => ({ cells: [] })),
    };
    await source.addSourcePage({ id: 'page', page, blocks: [table] });
    const batch = source.getMeasurementBatch();
    assert.equal(batch.blocks[0], table);
    assert.equal(batch.endOfSourcePage, true);
    assert.equal(batch.originalTableRowCounts.table, 40);
  } finally {
    await source.dispose();
  }
});
test('物化文档在挂载测量器前超过六个源页也不会被流式背压阻塞', async () => {
  const abort = new AbortController();
  const source = create(abort.signal);
  const timer = setTimeout(() => abort.abort(), 250);
  try {
    for (let index = 0; index < 8; index++)
      await source.addSourcePage({
        id: 'page-' + index,
        page,
        blocks: [
          { id: 'p-' + index, type: 'paragraph', text: '正文', inlines: [] },
        ],
      });
    assert.equal(source.getSnapshot().pages.length, 8);
  } finally {
    clearTimeout(timer);
    await source.dispose();
  }
});
