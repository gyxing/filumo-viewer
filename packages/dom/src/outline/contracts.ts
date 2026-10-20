import type { StylePolicy } from '../contracts';

/** 读取已加载节点；访问器不承担格式解析或异步子级加载。 */
export interface OutlineAccessors<TNode> {
  getId(node: TNode): string;
  getText(node: TNode): string;
  isLeaf(node: TNode): boolean;
  getChildren(node: TNode): readonly TNode[] | undefined;
}

/** 格式层持有展开和加载状态；结构改变时递增 revision，选择改变无需递增。 */
export interface OutlineSnapshot<TNode> {
  revision: number;
  roots: readonly TNode[];
  expanded: ReadonlySet<string>;
  loading: ReadonlySet<string>;
  selectedId?: string;
}

export interface OutlineRevealOptions {
  focus?: boolean;
  align?: 'nearest' | 'reading';
}

/** 公共树只发出用户意图，格式适配层提交真实状态并处理导航错误。 */
export interface OutlineTreeOptions<TNode> {
  document: Document;
  accessors: OutlineAccessors<TNode>;
  locale?: 'zh-CN' | 'en-US';
  stylePolicy?: StylePolicy;
  /** 只渲染可见行的标签内容；可访问名称、提示及键盘操作仍使用 getText。 */
  renderLabel?(node: TNode, document: Document): Node | null | undefined;
  onToggle(id: string, expanded: boolean): void;
  onActivate(id: string): void;
}

export interface OutlineRow<TNode> {
  node: TNode;
  id: string;
  text: string;
  parentId?: string;
  depth: number;
  isLeaf: boolean;
  expanded: boolean;
  loading: boolean;
  siblingIndex: number;
  siblingCount: number;
  hasNextSibling: boolean;
  ancestorHasNextSibling: readonly boolean[];
}
