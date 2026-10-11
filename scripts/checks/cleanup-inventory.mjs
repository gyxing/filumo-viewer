import { isAbsolute, relative, resolve } from 'node:path';
/** 盘点不执行文件操作；未知归属、链接和未备份内容不能进入迁移集。 */
export function validateCleanupPlan({ root, recoveryRoot, files }) {
  const errors = [];
  const seen = new Set();
  const under = (base, p) => {
    const r = relative(resolve(base), resolve(p));
    return !r.startsWith('..') && !isAbsolute(r);
  };
  if (under(root, recoveryRoot)) errors.push('恢复目录必须在工作区外');
  for (const item of files) {
    if (item.action === 'keep') continue;
    if (item.owner !== 'cleanup') errors.push('未知归属：' + item.source);
    if (item.linked) errors.push('拒绝链接：' + item.source);
    if (!item.backupVerified) errors.push('缺恢复副本：' + item.source);
    if (item.actualSha256 !== item.sha256)
      errors.push('源哈希漂移：' + item.source);
    for (const p of [item.source, item.target].filter(Boolean))
      if (isAbsolute(p) || !under(root, resolve(root, p)))
        errors.push('路径越界：' + p);
    if (item.target) {
      if (seen.has(item.target)) errors.push('目标冲突：' + item.target);
      seen.add(item.target);
    }
  }
  return errors;
}
