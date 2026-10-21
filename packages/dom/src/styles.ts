import type { StylePolicy } from './contracts';
import { PACKAGE_VERSION, STYLE_GROUP } from './generated/package';
interface Definition {
  group: string;
  id: string;
  css: string;
}
interface StyleEntry {
  element: HTMLStyleElement;
  css: string;
  references: number;
}
const definitions = new Map<string, Definition>();
const groupVersions = new Map<string, Set<string>>([
  [STYLE_GROUP, new Set([PACKAGE_VERSION])],
]);
const listeners = new Set<(definition: Definition) => void>();
// 同一 Document 中的重复包副本共享租约，避免卸载一个实例时误删其他实例样式。
const STORE = Symbol.for('filumo.style-leases.v1');
type StyleDocument = Document & { [STORE]?: Map<string, StyleEntry> };
/** 声明预编译样式，不访问 DOM；支持在 SSR 中安全导入。 */
export function registerStyle(group: string, id: string, css: string): void {
  const previous = definitions.get(id);
  if (previous) {
    if (previous.css !== css) throw new Error('样式 ID 内容冲突：' + id);
    return;
  }
  // 仅内部构建 ID 携带版本；自定义自动样式 ID 不被强制改写。
  const parts = id.split(':');
  if (
    parts.length === 3 &&
    parts[0] === group &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(parts[1]) &&
    /^[a-f0-9]{16}$/.test(parts[2])
  ) {
    const versions = groupVersions.get(group) ?? new Set<string>();
    versions.add(parts[1]);
    groupVersions.set(group, versions);
  }
  const definition = { group, id, css };
  definitions.set(id, definition);
  for (const listener of listeners) listener(definition);
}
/** 开发加载器以稳定 ID 原位更新声明；发布构建仍使用不可变 registerStyle。 */
export function replaceStyle(group: string, id: string, css: string): void {
  if (!definitions.has(id)) {
    registerStyle(group, id, css);
    return;
  }
  if (definitions.get(id)!.group !== group)
    throw new Error('样式 ID 分组冲突：' + id);
  const definition = { group, id, css };
  definitions.set(id, definition);
  for (const listener of listeners) listener(definition);
}
/** 获取一个样式的引用，并返回幂等释放函数。 */
function acquire(
  document: StyleDocument,
  definition: Definition,
  policy: StylePolicy,
): () => void {
  let store = document[STORE];
  if (!store) {
    store = new Map();
    Object.defineProperty(document, STORE, { value: store });
  }
  let entry = store.get(definition.id);
  if (entry && entry.css !== definition.css)
    throw new Error('已有样式内容不一致');
  if (!entry) {
    const element = document.createElement('style');
    element.dataset.filumoStyle = definition.id;
    if (policy.nonce) element.nonce = policy.nonce;
    element.textContent = definition.css;
    (document.head ?? document.documentElement).append(element);
    if (!element.sheet) {
      element.remove();
      throw new Error('样式未生效，请检查 CSP nonce 或使用 external 样式模式');
    }
    entry = { element, css: definition.css, references: 0 };
    store.set(definition.id, entry);
  }
  entry.references++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry!.references === 0) {
      entry!.element.remove();
      store!.delete(definition.id);
    }
  };
}
/** 为视图持有样式组，后续懒加载样式会在组件首次布局前同步注册。 */
export function useStyles(
  group: string,
  document: Document,
  policy: StylePolicy = {},
): () => void {
  if (policy.mode === 'external') {
    const marker = document.defaultView
      ?.getComputedStyle(document.documentElement)
      .getPropertyValue('--filumo-style-' + group)
      .trim();
    const versions = groupVersions.get(group);
    // external 的单值组标记无法证明多版本兼容，冲突时明确拒绝。
    if (!versions || versions.size !== 1 || !versions.has(marker ?? ''))
      throw new Error(
        '缺少匹配版本的 ' + group + ' 外部样式，请先加载对应 styles.css',
      );
    return () => undefined;
  }
  const leases = new Map<string, () => void>();
  let closed = false;
  const attach = (definition: Definition) => {
    if (!closed && definition.group === group && leases.has(definition.id)) {
      const entry = (document as StyleDocument)[STORE]?.get(definition.id);
      if (entry && entry.css !== definition.css) {
        entry.css = definition.css;
        entry.element.textContent = definition.css;
      }
    }
    if (!closed && definition.group === group && !leases.has(definition.id))
      leases.set(definition.id, acquire(document, definition, policy));
  };
  try {
    for (const definition of definitions.values()) attach(definition);
  } catch (error) {
    for (const release of leases.values()) release();
    throw error;
  }
  listeners.add(attach);
  return () => {
    if (closed) return;
    closed = true;
    listeners.delete(attach);
    for (const release of leases.values()) release();
    leases.clear();
  };
}
