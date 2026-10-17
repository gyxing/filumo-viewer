import { WORKSPACE_PACKAGES } from '../workspace-packages.js';
const PACKAGE_NAMES = new Set(WORKSPACE_PACKAGES.map((item) => item.name));

/**
 * 根据 workspace 运行时依赖计算包构建闭包，保证单包构建不会读取过期前置产物。
 * @param {readonly string[]} names 请求构建的包目录名
 * @param {Record<string, {dependencies?: Record<string, string>}>} manifests 包元数据
 * @returns {string[]} 前置包在前的稳定拓扑序
 */
export function resolveBuildOrder(names, manifests) {
  const requested = [...new Set(names)];
  const state = new Map();
  const result = [];
  const visit = (name, chain = []) => {
    if (!PACKAGE_NAMES.has(name) || !manifests[name])
      throw Error('未知包：' + name);
    const current = state.get(name);
    if (current === 'done') return;
    if (current === 'visiting')
      throw Error('包存在循环依赖：' + [...chain, name].join(' -> '));
    state.set(name, 'visiting');
    const dependencies = manifests[name].dependencies ?? {};
    for (const [dependency, range] of Object.entries(dependencies)) {
      if (!/^workspace:/.test(String(range))) continue;
      if (!dependency.startsWith('@fivo/')) continue;
      visit(dependency.slice('@fivo/'.length), [...chain, name]);
    }
    state.set(name, 'done');
    result.push(name);
  };
  for (const name of requested) visit(name);
  return result;
}

export { PACKAGE_NAMES };
