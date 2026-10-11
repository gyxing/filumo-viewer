/** 比对固定语义与几何；外壳节点数不是文档语义。 */
export function validateReference(actual, expected, { geometry = true } = {}) {
  const failures = [];
  for (const key of ['text', 'images', 'tables'])
    if (actual[key] !== expected[key]) failures.push(key);
  if (JSON.stringify(actual.cells) !== JSON.stringify(expected.cells))
    failures.push('cells');
  if (geometry && Math.abs(actual.width - expected.width) >= 0.5)
    failures.push('width');
  return { passed: failures.length === 0, failures };
}
