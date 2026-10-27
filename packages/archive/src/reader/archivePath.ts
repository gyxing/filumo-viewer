/** 归档路径只用于虚拟目录，禁止访问绝对路径、盘符和根目录之外。 */
export function archivePath(raw: string): string {
  if (!raw || raw.includes('\0') || /^[\\/]|^[a-z]:/i.test(raw))
    throw new Error('归档条目路径不安全');
  const parts: string[] = [];
  for (const part of raw.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('资源路径超出归档根目录');
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}
/** 包内相对资源基于条目目录解析，查询和片段不会成为归档文件名。 */
export function relativeEntryPath(
  from: string,
  reference: string,
): string | undefined {
  if (/^[a-z][a-z\d+.-]*:|^[\\/]/i.test(reference)) return;
  try {
    const value = decodeURIComponent(reference.split(/[?#]/)[0]);
    return archivePath(from.slice(0, from.lastIndexOf('/') + 1) + value);
  } catch {
    return;
  }
}
