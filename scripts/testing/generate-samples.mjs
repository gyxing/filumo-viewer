import { fileURLToPath } from 'node:url';
import {
  createPasswordPdfFixture,
  createScanPdfFixture,
} from '../../tests/fixtures/public/image-pdf/node-samples.mjs';
import {
  createPdfFixture,
  imageFixture,
} from '../../tests/fixtures/public/image-pdf/samples.mjs';
// 生成不含业务数据的最小 OOXML 文档，供示例和集成验收复用。
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const requireOffice = createRequire(
  new URL('../../packages/office/package.json', import.meta.url),
);
const { TextReader, Uint8ArrayWriter, ZipWriter } = await import(
  new URL(
    '../../packages/office/node_modules/@zip.js/zip.js/lib/zip-core-native.js',
    import.meta.url,
  ).href
);
const out = fileURLToPath(
  new URL('../../tests/fixtures/public/generated/', import.meta.url),
);
await mkdir(out, { recursive: true });
await writeFile(out + '/sample.svg', imageFixture, 'utf8');
await writeFile(out + '/sample.pdf', createPdfFixture(12, true));
await writeFile(out + '/sample-password.pdf', createPasswordPdfFixture());
await writeFile(out + '/sample-scan.pdf', createScanPdfFixture());
const rels = (target) =>
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="' +
  target +
  '"/></Relationships>';
const types = (entries) =>
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
  entries
    .map(
      ([part, type]) =>
        '<Override PartName="/' + part + '" ContentType="' + type + '"/>',
    )
    .join('') +
  '</Types>';
const samples = {
  docx: {
    '[Content_Types].xml': types([
      [
        'word/document.xml',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
      ],
    ]),
    '_rels/.rels': rels('word/document.xml'),
    'word/document.xml':
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Filumo Office preview ready</w:t></w:r></w:p><w:p><w:r><w:t>DOCX bridge and automatic styles</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>',
  },
  xlsx: {
    '[Content_Types].xml': types([
      [
        'xl/workbook.xml',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      ],
      [
        'xl/worksheets/sheet1.xml',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
      ],
    ]),
    '_rels/.rels': rels('xl/workbook.xml'),
    'xl/workbook.xml':
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Filumo sheet" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Filumo spreadsheet</t></is></c><c r="B1"><v>42</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Automatic styles</t></is></c></row></sheetData></worksheet>',
  },
  pptx: {
    '[Content_Types].xml': types([
      [
        'ppt/presentation.xml',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
      ],
      [
        'ppt/slides/slide1.xml',
        'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
      ],
    ]),
    '_rels/.rels': rels('ppt/presentation.xml'),
    'ppt/presentation.xml':
      '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>',
    'ppt/slides/slide1.xml':
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="7315200" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800"/><a:t>Filumo presentation ready</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
  },
};
samples.docx['[Content_Types].xml'] = types([
  [
    'word/document.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  ],
  [
    'word/styles.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
  ],
  [
    'word/comments.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml',
  ],
]);
samples.docx['word/styles.xml'] =
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>';
samples.docx['word/_rels/document.xml.rels'] =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
samples.docx['word/comments.xml'] =
  '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="0" w:author="Filumo" w:date="2026-10-01T00:00:00Z"><w:p><w:r><w:t>Filumo comment fixture</w:t></w:r></w:p></w:comment></w:comments>';
samples.docx['word/document.xml'] =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Filumo heading</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Filumo Office preview ready. </w:t></w:r><w:ins w:id="1" w:author="Filumo" w:date="2026-10-01T00:00:00Z"><w:r><w:t xml:space="preserve">Inserted text </w:t></w:r></w:ins><w:del w:id="2" w:author="Filumo" w:date="2026-10-01T00:00:00Z"><w:r><w:delText>Deleted text</w:delText></w:r></w:del></w:p><w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Commented sentence</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
samples.xlsx['[Content_Types].xml'] = samples.xlsx[
  '[Content_Types].xml'
].replace(
  '</Types>',
  '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/></Types>',
);
samples.xlsx['xl/worksheets/_rels/sheet1.xml.rels'] =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdComment" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/></Relationships>';
samples.xlsx['xl/comments1.xml'] =
  '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>Filumo</author></authors><commentList><comment ref="A1" authorId="0"><text><t>Cell comment fixture</t></text></comment></commentList></comments>';
samples.pptx['[Content_Types].xml'] = samples.pptx[
  '[Content_Types].xml'
].replace(
  '</Types>',
  '<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>',
);
samples.pptx['ppt/presentation.xml'] = samples.pptx[
  'ppt/presentation.xml'
].replace('</p:sldIdLst>', '<p:sldId id="257" r:id="rId2"/></p:sldIdLst>');
samples.pptx['ppt/_rels/presentation.xml.rels'] = samples.pptx[
  'ppt/_rels/presentation.xml.rels'
].replace(
  '</Relationships>',
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>',
);
samples.pptx['ppt/slides/slide2.xml'] = samples.pptx[
  'ppt/slides/slide1.xml'
].replace('Filumo presentation ready', 'Filumo second slide');
samples.pptx['ppt/slides/_rels/slide1.xml.rels'] =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>';
samples.pptx['ppt/notesSlides/notesSlide1.xml'] =
  '<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Filumo speaker notes</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>';
for (const [format, entries] of Object.entries(samples)) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  for (const [name, content] of Object.entries(entries))
    await writer.add(name, new TextReader(content), {
      level: 0,
      // ZIP 使用本地 DOS 时间；固定本地字段，避免 Windows 与 Linux 时区改变样本哈希。
      lastModDate: new Date(2020, 0, 1),
      extendedTimestamp: false,
    });
  await writeFile(out + '/sample.' + format, await writer.close());
}

// 分页对照专用文档：长表格、连续段落、页眉页脚和脚注均由公开合成内容组成。
const complex = { ...samples.docx };
const paragraph = (text) =>
  '<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="24"/></w:rPr><w:t>' +
  text +
  '</w:t></w:r></w:p>';
const rows = Array.from(
  { length: 36 },
  (_, index) =>
    '<w:tr><w:trPr>' +
    (index === 0 ? '<w:tblHeader/>' : '') +
    '</w:trPr><w:tc><w:tcPr><w:tcW w:w="3800" w:type="dxa"/></w:tcPr>' +
    paragraph('表格 ' + index + ' A：' + '多行单元格内容 '.repeat(12)) +
    '</w:tc><w:tc><w:tcPr><w:tcW w:w="3800" w:type="dxa"/></w:tcPr>' +
    paragraph('表格 ' + index + ' B') +
    '</w:tc></w:tr>',
).join('');
const body =
  Array.from({ length: 12 }, (_, i) =>
    paragraph('前置段落 ' + i + '：' + '正文分页测试 '.repeat(10)),
  ).join('') +
  '<w:p><w:r><w:t>脚注引用</w:t><w:footnoteReference w:id="1"/></w:r></w:p>' +
  '<w:tbl><w:tblPr><w:tblW w:w="7600" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3800"/><w:gridCol w:w="3800"/></w:tblGrid>' +
  rows +
  '</w:tbl>' +
  Array.from({ length: 8 }, (_, i) =>
    paragraph('后置段落 ' + i + '：' + '收尾正文 '.repeat(12)),
  ).join('');
complex['word/document.xml'] =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
  body +
  '<w:sectPr><w:headerReference w:type="default" r:id="headerNative"/><w:footerReference w:type="default" r:id="footerNative"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>';
complex['word/header1.xml'] =
  '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  paragraph('固定页眉 Filumo') +
  '</w:hdr>';
complex['word/footer1.xml'] =
  '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>';
complex['word/footnotes.xml'] =
  '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1">' +
  paragraph('脚注说明 Filumo') +
  '</w:footnote></w:footnotes>';
const relations = ['header', 'footer', 'footnotes']
  .map(
    (type, index) =>
      '<Relationship Id="' +
      ['headerNative', 'footerNative', 'notesNative'][index] +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' +
      type +
      '" Target="' +
      ['header1.xml', 'footer1.xml', 'footnotes.xml'][index] +
      '"/>',
  )
  .join('');
complex['word/_rels/document.xml.rels'] = (
  complex['word/_rels/document.xml.rels'] ??
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
).replace('</Relationships>', relations + '</Relationships>');
complex['[Content_Types].xml'] = complex['[Content_Types].xml'].replace(
  '</Types>',
  '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>',
);
const complexWriter = new ZipWriter(new Uint8ArrayWriter(), {
  useWebWorkers: false,
});
for (const [name, content] of Object.entries(complex))
  await complexWriter.add(name, new TextReader(content), {
    level: 0,
    lastModDate: new Date(2020, 0, 1),
    extendedTimestamp: false,
  });
await writeFile(out + '/sample-complex.docx', await complexWriter.close());

// 文本夹具使用已知编码字节，不为样本生成引入额外编码依赖。
await writeFile(
  out + '/sample.txt',
  '纯文本示例\r\n第二行：保留空白与制表符\t内容\n\n结束。\n',
  'utf8',
);

// 格式扩展样本与浏览器夹具共享同一来源。
for (const sample of (
  await import('../../tests/fixtures/public/text-expansion/samples.mjs')
).expansionSamples)
  await writeFile(out + '/' + sample.file, sample.text, 'utf8');
await writeFile(
  out + '/sample.log',
  Array.from(
    { length: 2000 },
    (_, index) => '2026-01-01 INFO 示例日志 ' + index,
  ).join('\n'),
  'utf8',
);
await writeFile(
  out + '/sample-utf16.txt',
  Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from('UTF-16 中文示例\r\n第二行', 'utf16le'),
  ]),
);
await writeFile(out + '/sample-gbk.txt', Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4));
await writeFile(
  out + '/sample.json',
  '{\n  "name": "示例",\n  "large": 900719925474099312345,\n  "active": true,\n  "items": [1, null, {"value": "内容"}],\n  "duplicate": 1,\n  "duplicate": 2\n}\n',
  'utf8',
);
await writeFile(out + '/sample-invalid.json', '{"missing": [1, 2,]}', 'utf8');
await writeFile(
  out + '/sample.md',
  '# Markdown 示例\n\n正文包含 **粗体**、*强调*、~~删除线~~ 和 `代码`。\n\n## 任务\n\n- [x] 已完成\n- [ ] 待处理\n\n| 名称 | 值 |\n| --- | --- |\n| 示例 | 内容 |\n\n## 代码\n\n```js\nconst message = "中文";\nconsole.log(message);\n```\n\n> 引用内容\n\n[跳转任务](#任务)\n',
  'utf8',
);
