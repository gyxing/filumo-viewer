/** PAX 长度按字节计算，不能用 UTF-16 字符下标跳过中文路径。 */
export function parsePax(bytes: Uint8Array): Record<string, string> {
  const fields: Record<string, string> = Object.create(null);
  let at = 0;
  while (at < bytes.length) {
    const space = bytes.indexOf(32, at);
    if (space < 0) throw new Error('PAX 记录长度缺失');
    const length = Number(new TextDecoder().decode(bytes.slice(at, space)));
    if (
      !Number.isSafeInteger(length) ||
      length <= space - at + 1 ||
      at + length > bytes.length ||
      bytes[at + length - 1] !== 10
    )
      throw new Error('PAX 记录长度无效');
    const record = new TextDecoder().decode(
        bytes.slice(space + 1, at + length - 1),
      ),
      eq = record.indexOf('=');
    if (eq > 0) fields[record.slice(0, eq)] = record.slice(eq + 1);
    at += length;
  }
  return fields;
}
