/** 自建无业务数据夹具；PDF 的偏移按实际字节计算，可在浏览器按需生成长文档。 */
export function createPdfFixture(
  pageCount = 6,
  mixed = false,
  nestedOutline = false,
  readingOutline = false,
) {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 2000)
    throw Error('夹具页数无效');
  const outline = 4 + pageCount * 2,
    firstOutline = outline + 1,
    lastOutline = outline + 2,
    link = outline + 3;
  const objects = [''];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R /Outlines ${outline} 0 R >>`;
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${Array.from(
    { length: pageCount },
    (_, i) => `${4 + i * 2} 0 R`,
  ).join(' ')}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let index = 0; index < pageCount; index++) {
    const page = 4 + index * 2,
      stream = page + 1;
    const width = mixed && index % 3 === 1 ? 792 : 612,
      height = mixed && index % 3 === 1 ? 612 : 792;
    const content = `BT /F1 18 Tf 40 ${height - 60} Td (Filumo PDF page ${
      index + 1
    }) Tj 0 -30 Td (FILUMO_TARGET_${
      index + 1
    }) Tj 0 -30 Td (Continuous scroll fixture) Tj ET`;
    objects[
      page
    ] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ${
      mixed && index % 5 === 4 ? '/Rotate 90 ' : ''
    }/Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R ${
      index === 0 ? `/Annots [${link} 0 R]` : ''
    } >>`;
    objects[stream] = `<< /Length ${
      new TextEncoder().encode(content).length
    } >>\nstream\n${content}\nendstream`;
  }
  objects[
    outline
  ] = `<< /Type /Outlines /First ${firstOutline} 0 R /Last ${lastOutline} 0 R /Count 2 >>`;
  objects[
    firstOutline
  ] = `<< /Title (First page) /Parent ${outline} 0 R /Dest [4 0 R /Fit] /Next ${lastOutline} 0 R >>`;
  objects[lastOutline] = `<< /Title (Last page) /Parent ${outline} 0 R /Dest [${
    4 + (pageCount - 1) * 2
  } 0 R /Fit] /Prev ${firstOutline} 0 R >>`;
  // 专项夹具含同页书签和三层目录，原有普通/长文档夹具保持不变。
  if (nestedOutline) {
    const child = link + 1,
      sibling = link + 2,
      grandchild = link + 3;
    objects[
      outline
    ] = `<< /Type /Outlines /First ${firstOutline} 0 R /Last ${lastOutline} 0 R /Count 5 >>`;
    objects[
      firstOutline
    ] = `<< /Title (First page) /Parent ${outline} 0 R /Dest [4 0 R /Fit] /Next ${lastOutline} 0 R /First ${child} 0 R /Last ${sibling} 0 R /Count 3 >>`;
    objects[
      child
    ] = `<< /Title (Same page one) /Parent ${firstOutline} 0 R /Dest [4 0 R /Fit] /Next ${sibling} 0 R /First ${grandchild} 0 R /Last ${grandchild} 0 R /Count 1 >>`;
    objects[
      sibling
    ] = `<< /Title (Same page two) /Parent ${firstOutline} 0 R /Dest [4 0 R /Fit] /Prev ${child} 0 R >>`;
    objects[
      grandchild
    ] = `<< /Title (Nested section) /Parent ${child} 0 R /Dest [${
      4 + Math.min(1, pageCount - 1) * 2
    } 0 R /Fit] >>`;
  }
  // 每页提供两处不同坐标的书签，专门覆盖滚动同步和侧栏窗口自动定位。
  if (readingOutline) {
    const first = link + 1,
      last = first + (pageCount - 1) * 2;
    objects[
      outline
    ] = `<< /Type /Outlines /First ${first} 0 R /Last ${last} 0 R /Count ${
      pageCount * 2
    } >>`;
    for (let index = 0; index < pageCount; index++) {
      const root = first + index * 2,
        child = root + 1;
      const page = 4 + index * 2;
      const height = mixed && index % 3 === 1 ? 612 : 792;
      objects[root] = `<< /Title (Chapter ${
        index + 1
      }) /Parent ${outline} 0 R /Dest [${page} 0 R /XYZ 40 ${
        height - 60
      } null] ${index ? `/Prev ${root - 2} 0 R` : ''} ${
        index < pageCount - 1 ? `/Next ${root + 2} 0 R` : ''
      } /First ${child} 0 R /Last ${child} 0 R /Count 1 >>`;
      objects[child] = `<< /Title (Section ${
        index + 1
      }) /Parent ${root} 0 R /Dest [${page} 0 R /FitH ${height * 0.45}] >>`;
    }
  }
  objects[
    link
  ] = `<< /Type /Annot /Subtype /Link /Rect [40 650 250 690] /Border [0 0 0] /Dest [${
    4 + (pageCount - 1) * 2
  } 0 R /Fit] >>`;
  const chunks = ['%PDF-1.7\n%Filumo fixture\n'],
    offsets = [0],
    encoder = new TextEncoder();
  let length = encoder.encode(chunks[0]).length;
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = length;
    const part = `${id} 0 obj\n${objects[id]}\nendobj\n`;
    chunks.push(part);
    length += encoder.encode(part).length;
  }
  chunks.push(
    `xref\n0 ${objects.length}\n0000000000 65535 f \n` +
      offsets
        .slice(1)
        .map((at) => String(at).padStart(10, '0') + ' 00000 n \n')
        .join(''),
  );
  chunks.push(
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
  );
  return encoder.encode(chunks.join(''));
}

export const imageFixture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#eaf4ff"/><rect x="80" y="80" width="1040" height="640" rx="24" fill="#fff" stroke="#1677ff" stroke-width="4"/><text x="600" y="420" text-anchor="middle" font-family="sans-serif" font-size="56" fill="#243247">Filumo image preview</text></svg>';
