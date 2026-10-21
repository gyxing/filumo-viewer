import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const padding = Buffer.from(
  '28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a',
  'hex',
);
const md5 = (value) => createHash('md5').update(value).digest();
const pad = (value) =>
  Buffer.concat([Buffer.from(value, 'latin1'), padding]).subarray(0, 32);
// 仅生成兼容旧加密标准的测试文件，不用于业务密码或密钥处理。
function rc4(key, input) {
  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + state[i] + key[i % key.length]) & 255;
    [state[i], state[j]] = [state[j], state[i]];
  }
  const output = Buffer.alloc(input.length);
  let i = 0;
  j = 0;
  for (let at = 0; at < input.length; at++) {
    i = (i + 1) & 255;
    j = (j + state[i]) & 255;
    [state[i], state[j]] = [state[j], state[i]];
    output[at] = input[at] ^ state[(state[i] + state[j]) & 255];
  }
  return output;
}
function serialize(objects, trailer = '') {
  const chunks = [Buffer.from('%PDF-1.4\n%Filumo fixture\n')],
    offsets = [0];
  let length = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const part = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      Buffer.from(body),
      Buffer.from('\nendobj\n'),
    ]);
    chunks.push(part);
    length += part.length;
  });
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map((at) => String(at).padStart(10, '0') + ' 00000 n \n')
          .join('') +
        `trailer\n<< /Size ${
          objects.length + 1
        } /Root 1 0 R ${trailer} >>\nstartxref\n${length}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}
function stream(bytes, attributes = '') {
  return Buffer.concat([
    Buffer.from(`<< /Length ${bytes.length} ${attributes} >>\nstream\n`),
    bytes,
    Buffer.from('\nendstream'),
  ]);
}

/** 密码固定为 fixture；文件不含业务数据，用于真实 PDF.js 密码恢复测试。 */
export function createPasswordPdfFixture() {
  const id = md5(Buffer.from('Filumo password fixture')),
    permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-4);
  const owner = rc4(md5(pad('fixture-owner')).subarray(0, 5), pad('fixture'));
  const key = md5(
      Buffer.concat([pad('fixture'), owner, permissions, id]),
    ).subarray(0, 5),
    user = rc4(key, padding);
  const objectKey = md5(
    Buffer.concat([key, Buffer.from([5, 0, 0, 0, 0])]),
  ).subarray(0, 10);
  const content = rc4(
    objectKey,
    Buffer.from('BT /F1 18 Tf 40 700 Td (Unlocked Filumo fixture) Tj ET'),
  );
  return serialize(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      stream(content),
      `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${owner.toString(
        'hex',
      )}> /U <${user.toString('hex')}> /P -4 >>`,
    ],
    `/Encrypt 6 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>]`,
  );
}

/** 纯图像页面只验证无文字的边界，不代表大尺寸扫描件的性能样本。 */
export function createScanPdfFixture() {
  return serialize([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
    stream(Buffer.from('q 400 0 0 500 100 140 cm /Im1 Do Q')),
    stream(
      deflateSync(Buffer.from([220, 235, 255])),
      '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode',
    ),
  ]);
}
