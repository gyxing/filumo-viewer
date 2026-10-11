import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
/** 本机样本清单不进入浏览器 bundle，缺少配置时仅返回提示。 */
export async function loadLocalCatalog(root) {
  try {
    const data = JSON.parse(
      await readFile(join(root, 'tests/fixtures/local/manifest.json'), 'utf8'),
    );
    return {
      configured: true,
      samples: data.samples,
      aliases: data.aliases ?? {},
      diagnostics: [],
    };
  } catch (error) {
    if (error.code === 'ENOENT')
      return {
        configured: false,
        samples: [],
        aliases: {},
        diagnostics: ['未配置本地样本，可选择公开样本或本机文件'],
      };
    throw error;
  }
}
/** 文件只允许位于专用根内，拒绝任意路径和目录链接。 */
export async function resolveSampleFile(root, id, catalog) {
  if (!/^[a-z0-9-]+$/.test(id)) throw Error('非法样本ID');
  const sample = catalog.samples.find(
    (s) => s.id === (catalog.aliases[id] ?? id),
  );
  if (!sample) return;
  const base = await realpath(join(root, 'tests/fixtures/local/files'));
  if (
    isAbsolute(sample.relativePath) ||
    sample.relativePath.split(/[\\/]/).includes('..')
  )
    throw Error('样本越界');
  const file = join(base, sample.relativePath);
  let current = base;
  for (const part of sample.relativePath.split(/[\\/]/)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw Error('拒绝链接样本');
  }
  const resolved = await realpath(file);
  const r = relative(base, resolved);
  if (r.startsWith('..') || isAbsolute(r)) throw Error('样本越界');
  if (!(await lstat(resolved)).isFile()) throw Error('样本不是文件');
  return { ...sample, absolute: resolved };
}
