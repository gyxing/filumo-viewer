/** TAR 数字支持八进制与非负 base-256，拒绝无法精确表达的偏移。 */
export function tarNumber(bytes: Uint8Array): number {
  if (bytes[0] & 0x80) {
    if (bytes[0] & 0x40) throw new Error('不支持负 TAR 数字');
    let value = BigInt(bytes[0] & 0x7f);
    for (const b of bytes.slice(1)) value = value * BigInt(256) + BigInt(b);
    if (value > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('TAR 数字超出安全范围');
    return Number(value);
  }
  const text = new TextDecoder().decode(bytes).replace(/\0/g, '').trim();
  if (!text) return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error('TAR 数字字段损坏');
  const value = parseInt(text, 8);
  if (!Number.isSafeInteger(value)) throw new Error('TAR 数字超出安全范围');
  return value;
}
/** 校验和必须先验证，损坏头部不能用于分配文件缓冲。 */
export function parseTarHeader(bytes: Uint8Array) {
  if (bytes.length !== 512) throw new Error('TAR 文件头不完整');
  if (bytes.every((b) => b === 0)) return;
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : bytes[i];
  if (sum !== tarNumber(bytes.slice(148, 156)))
    throw new Error('TAR 文件头校验失败');
  const text = (a: number, b: number) =>
    new TextDecoder().decode(bytes.slice(a, b)).split('\0')[0];
  const prefix = text(345, 500),
    name = text(0, 100);
  return {
    path: prefix ? prefix + '/' + name : name,
    size: tarNumber(bytes.slice(124, 136)),
    type: text(156, 157) || '0',
    modified: tarNumber(bytes.slice(136, 148)) * 1000,
  };
}
