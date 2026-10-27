import { gzipSync } from 'node:zlib';
/** 小型确定性归档用于回归，测试不需要安装压缩命令或联网生成。 */
export function tarFixture(
  files = {
    'docs/readme.txt': 'Hello Filumo',
    'readme.html': '<h1>Archive</h1>',
  },
) {
  const parts = [];
  for (const [path, source] of Object.entries(files)) {
    const content = Buffer.from(source),
      header = Buffer.alloc(512);
    header.write(path, 0, 100);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.write(
      header
        .reduce((a, b) => a + b, 0)
        .toString(8)
        .padStart(6, '0') + '\0 ',
      148,
    );
    parts.push(
      header,
      content,
      Buffer.alloc((512 - (content.length % 512)) % 512),
    );
  }
  return Buffer.concat([...parts, Buffer.alloc(1024)]);
}
export function gzipFixture(text = 'Hello Filumo') {
  return gzipSync(Buffer.from(text));
}
export function tarGzipFixture() {
  return gzipSync(tarFixture());
}
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipFixture(
  files = { 'docs/readme.txt': 'Hello Filumo', 'data.json': '{"ok":true}' },
) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [path, value] of Object.entries(files)) {
    const name = Buffer.from(path),
      body = Buffer.from(value),
      crc = crc32(body),
      header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(body.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, body);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(body.length, 20);
    record.writeUInt32LE(body.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += header.length + name.length + body.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
