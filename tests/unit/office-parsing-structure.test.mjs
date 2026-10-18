import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';

const bundle = await build({
  stdin: {
    contents: `export {parseXml} from './packages/office/src/engine/ooxml/xml';
      export {readOfficeTheme} from './packages/office/src/engine/ooxml/theme';
      export {createDocxParseContext} from './packages/office/src/engine/docx/docxParsingContext';
      export {readDocxBlockChildren, normalizeDocxPageContents} from './packages/office/src/engine/docx/parseDocxContent';
      export {parsePptxVisualTree} from './packages/office/src/engine/pptx/parsePptxSlide';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { parseXml, readOfficeTheme, createDocxParseContext, readDocxBlockChildren,
  normalizeDocxPageContents, parsePptxVisualTree } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('DOCX 表格拆分后保留纵向合并、嵌套表格与百分比边缘宽度', () => {
  const paragraph = (text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const xml = `<w:body xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:tbl><w:tblPr><w:tblW w:type="pct" w:w="5000"/></w:tblPr>
      <w:tblGrid><w:gridCol w:w="1440"/><w:gridCol w:w="1440"/></w:tblGrid>
      <w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>${paragraph('A')}</w:tc>
        <w:tc>${paragraph('B')}</w:tc></w:tr>
      <w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr>${paragraph('')}</w:tc>
        <w:tc><w:tbl><w:tr><w:tc>${paragraph('嵌套')}</w:tc></w:tr></w:tbl></w:tc></w:tr>
    </w:tbl></w:body>`;
  const context = createDocxParseContext(new Map());
  const [table] = readDocxBlockChildren(parseXml(xml).documentElement, 'test', context);
  assert.equal(table.type, 'table');
  assert.equal(table.width, 206);
  assert.equal(table.rows[0].cells[0].rowSpan, 2);
  assert.equal(table.rows[0].cells[0].blocks[0].text, 'A');
  assert.equal(table.rows[1].cells.length, 1);
  const nested = table.rows[1].cells[0].blocks[0];
  assert.equal(nested.type, 'table');
  assert.equal(nested.rows[0].cells[0].blocks[0].text, '嵌套');
});

test('DOCX 原入口仍保留整页定位画布拆分和连续标题行高规则', () => {
  const page = { width: 800, minHeight: 1000 };
  const canvas = (id) => ({ id, type: 'chart', width: 800, height: 1000,
    position: { left: 0, top: 0, relativeFromV: 'page' } });
  const spacer = { type: 'paragraph', text: '', inlines: [] };
  const pages = normalizeDocxPageContents([{ id: 'source', page,
    blocks: [canvas('a'), spacer, spacer, canvas('b')] }]);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((item) => item.id), ['docx-page-1', 'docx-page-2']);
  assert.ok(pages.every((item) => item.preservePhysicalPage));
  const heading = (text) => ({ type: 'paragraph', text, inlines: [],
    outlineLevel: 1, inferredHeadingLineHeight: true, style: { fontSize: 24 }, lineHeight: 43.2 });
  const [headings] = normalizeDocxPageContents([{ id: 'headings', page,
    blocks: [heading('一'), heading('二')] }]);
  assert.equal(headings.blocks[0].lineHeight, 32);
  assert.equal(headings.blocks[1].lineHeight, 43.2);
});

test('PPTX 原视觉树入口仍应用表格条件样式、直接样式和几何尺寸', () => {
  const xml = `<p:spTree xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <p:graphicFrame><p:xfrm><a:off x="95250" y="190500"/><a:ext cx="914400" cy="914400"/></p:xfrm>
      <a:graphic><a:graphicData><a:tbl><a:tblPr firstRow="1"><a:tableStyleId>test</a:tableStyleId></a:tblPr>
        <a:tblGrid><a:gridCol w="914400"/></a:tblGrid><a:tr h="914400"><a:tc>
          <a:txBody><a:p><a:r><a:rPr b="1" sz="2400"/><a:t>内容</a:t></a:r></a:p></a:txBody>
          <a:tcPr><a:noFill/></a:tcPr></a:tc></a:tr>
      </a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree>`;
  const packageState = { entries: new Map(), relationships: {}, mediaByPath: {}, mediaByName: {} };
  const [table] = parsePptxVisualTree(parseXml(xml).documentElement, readOfficeTheme(),
    packageState, {}, 'fixture', undefined, { test: { variants: {
      wholeTbl: { text: { fontSize: 20 }, backgroundColor: '#ff0000' },
      firstRow: { borderColor: '#0000ff' },
    } } });
  assert.equal(table.type, 'table');
  assert.equal(table.id, 'fixture-table-0');
  assert.deepEqual([table.x, table.y, table.width, table.height], [10, 20, 96, 96]);
  const cell = table.rows[0][0];
  assert.equal(cell.text, '内容');
  assert.equal(cell.style.bold, true);
  assert.equal(cell.style.fontSize, 32);
  assert.equal(cell.backgroundColor, null);
  assert.equal(cell.borderColor, '#0000ff');
});
