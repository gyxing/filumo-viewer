import { throwIfAborted } from '@filumo/core';
import type { StylePolicy } from '@filumo/dom';
import { OUTLINE_DEFAULTS, OutlineTree } from '@filumo/dom/outline';
import type {
  PdfBackend,
  PdfOutlineEntry,
  PdfReadingPosition,
} from '../runtime/contracts';

/** 书签跳转携带页内比例和取消信号，避免旧异步定位覆盖新的阅读位置。 */
export type PdfOutlineNavigate = (
  index: number,
  ratio?: number,
  signal?: AbortSignal,
) => void | Promise<void>;
interface IndexedEntry {
  entry: PdfOutlineEntry;
  parentId?: string;
  depth: number;
  order: number;
}
interface Candidate {
  id: string;
  ratio: number;
  depth: number;
  order: number;
}
interface PagePositions {
  candidates: Candidate[];
  offsets: Map<string, number | undefined>;
}
interface OutlineMatch {
  id?: string;
  pendingPage?: number;
}
interface OutlineRuntime {
  backend?: Pick<PdfBackend, 'getOutlineOffset'>;
  onError?(error: unknown): void;
}

/** 依据当前阅读位置同步书签；页内坐标只在当前页需要时换算，不加载全文页面。 */
export class PdfOutline {
  readonly element: HTMLElement;
  private tree: OutlineTree<PdfOutlineEntry>;
  private entries: readonly PdfOutlineEntry[] = [];
  private nodes = new Map<string, IndexedEntry>();
  private groups = new Map<number, IndexedEntry[]>();
  private pages: number[] = [];
  private cache = new Map<string, PagePositions>();
  private expanded = new Set<string>();
  private loading = new Set<string>();
  private revision = 0;
  private selected?: string;
  private position: PdfReadingPosition = {
    pageIndex: 0,
    ratio: 0,
    rotation: 0,
    interaction: 0,
  };
  private active = true;
  private closed = false;
  private resolving?: {
    key: string;
    controller: AbortController;
    promise: Promise<void>;
  };
  private navigation?: { id: string; controller: AbortController };
  private explicit?: { id: string; interaction: number };
  private revealFrame?: number;
  private revealId?: string;
  private needsReveal = false;

  constructor(
    document: Document,
    private navigate: PdfOutlineNavigate,
    locale?: 'zh-CN' | 'en-US',
    stylePolicy?: StylePolicy,
    private runtime: OutlineRuntime = {},
  ) {
    this.tree = new OutlineTree({
      document,
      locale,
      stylePolicy,
      accessors: {
        getId: (entry: PdfOutlineEntry) => entry.id,
        getText: (entry) => entry.title,
        isLeaf: (entry) => !entry.children.length,
        getChildren: (entry) => entry.children,
      },
      onToggle: (id, expanded) => {
        if (expanded) this.expanded.add(id);
        else this.expanded.delete(id);
        this.revision++;
        this.publish();
      },
      onActivate: (id) => this.activate(id),
    });
    this.element = this.tree.element;
  }
  private key(page: number, rotation = this.position.rotation) {
    return rotation + ':' + page;
  }
  private publish() {
    if (!this.closed)
      this.tree.update({
        revision: this.revision,
        roots: this.entries,
        expanded: this.expanded,
        loading: this.loading,
        selectedId: this.selected,
      });
  }
  /** 全文索引保留每个节点身份；按页分组不丢弃同页子标题。 */
  setEntries(entries: readonly PdfOutlineEntry[]): void {
    if (this.closed) return;
    this.cancelReveal();
    this.needsReveal = false;
    this.resolving?.controller.abort();
    this.navigation?.controller.abort();
    this.resolving = undefined;
    this.navigation = undefined;
    this.explicit = undefined;
    this.entries = entries;
    this.nodes.clear();
    this.groups.clear();
    this.cache.clear();
    this.expanded.clear();
    const stack = entries
      .map((entry) => ({
        entry,
        parentId: undefined as string | undefined,
        depth: 0,
      }))
      .reverse();
    while (stack.length) {
      const current = stack.pop()!,
        node = { ...current, order: this.nodes.size };
      this.nodes.set(node.entry.id, node);
      const group = this.groups.get(node.entry.pageIndex) ?? [];
      group.push(node);
      this.groups.set(node.entry.pageIndex, group);
      for (let index = node.entry.children.length - 1; index >= 0; index--)
        stack.push({
          entry: node.entry.children[index],
          parentId: node.entry.id,
          depth: node.depth + 1,
        });
    }
    for (const [id, node] of this.nodes)
      if (
        node.entry.children.length &&
        (this.nodes.size <= OUTLINE_DEFAULTS.completeTreeLimit || !node.depth)
      )
        this.expanded.add(id);
    this.pages = [...this.groups.keys()].sort((a, b) => a - b);
    this.selected = undefined;
    this.revision++;
    this.publish();
    this.sync();
  }
  private pageGroupAtPosition(): number {
    let begin = 0,
      end = this.pages.length;
    while (begin < end) {
      const middle = (begin + end) >>> 1;
      if (this.pages[middle] <= this.position.pageIndex) begin = middle + 1;
      else end = middle;
    }
    return begin - 1;
  }
  private fallback(page: number): Candidate[] {
    const first = this.groups.get(page)?.[0];
    return first
      ? [
          {
            id: first.entry.id,
            ratio: 0,
            depth: first.depth,
            order: first.order,
          },
        ]
      : [];
  }
  private positions(page: number): PagePositions | undefined {
    const key = this.key(page),
      cached = this.cache.get(key);
    if (cached) return cached;
    // 只有真实坐标需要异步换算；没有坐标与坐标尚未加载不能共用临时页首选择。
    if (
      this.runtime.backend?.getOutlineOffset &&
      this.groups.get(page)?.some((node) => node.entry.destination)
    )
      return undefined;
    const positions = this.buildPositions(page, new Map());
    this.cache.set(key, positions);
    return positions;
  }
  private match(): OutlineMatch {
    const explicit = this.explicit && this.nodes.get(this.explicit.id);
    const cached = explicit
      ? this.cache.get(this.key(explicit.entry.pageIndex))
      : undefined;
    // 无页内坐标时无法推断同页先后，保留用户明确点击的书签。
    if (
      explicit?.entry.pageIndex === this.position.pageIndex &&
      (this.explicit!.interaction === this.position.interaction ||
        cached?.offsets.get(explicit.entry.id) === undefined)
    )
      return { id: explicit.entry.id };
    this.explicit = undefined;
    let index = Math.max(0, this.pageGroupAtPosition());
    while (index >= 0 && this.pages.length) {
      const page = this.pages[index],
        positions = this.positions(page);
      if (!positions) return { pendingPage: page };
      const candidates = positions.candidates;
      const ratio =
        page < this.position.pageIndex
          ? 1
          : page === this.position.pageIndex
          ? this.position.ratio
          : -Infinity;
      let begin = 0,
        end = candidates.length;
      while (begin < end) {
        const middle = (begin + end) >>> 1;
        if (candidates[middle].ratio <= ratio) begin = middle + 1;
        else end = middle;
      }
      if (begin) return { id: candidates[begin - 1].id };
      // 尚未经过本页第一个标题时，继续匹配上一书签页，避免在页边界提前切换。
      if (!index) return { id: candidates[0]?.id };
      index--;
    }
    return {};
  }
  private sync(reveal = false) {
    if (this.closed || this.navigation) return;
    this.needsReveal ||= reveal;
    const match = this.match();
    if (match.pendingPage !== undefined) {
      // 坐标未就绪时保留上次稳定选择；完成后从最新正文位置重新匹配，只提交一次结果。
      this.needsReveal ||= this.revealId !== undefined;
      this.cancelReveal();
      if (this.active)
        void this.loadPage(match.pendingPage, this.position.rotation);
      return;
    }
    const id = match.id;
    let changed = id !== this.selected;
    let parent =
      id && (changed || this.needsReveal)
        ? this.nodes.get(id)?.parentId
        : undefined;
    while (parent) {
      if (!this.expanded.has(parent)) {
        this.expanded.add(parent);
        this.revision++;
        changed = true;
      }
      parent = this.nodes.get(parent)?.parentId;
    }
    this.selected = id;
    if (changed) this.publish();
    if (id && this.active && (changed || this.needsReveal))
      this.scheduleReveal(id);
    this.needsReveal = false;
  }
  private cancelReveal() {
    if (this.revealFrame !== undefined)
      this.element.ownerDocument.defaultView?.cancelAnimationFrame(
        this.revealFrame,
      );
    this.revealFrame = undefined;
    this.revealId = undefined;
  }
  private scheduleReveal(id: string) {
    this.revealId = id;
    const window = this.element.ownerDocument.defaultView;
    if (!window) {
      this.flushReveal();
      return;
    }
    if (this.revealFrame !== undefined) return;
    // 一帧内只定位最终选中项；沿用公共树的最近可见定位，不启动连续平滑动画。
    this.revealFrame = window.requestAnimationFrame(() => {
      this.revealFrame = undefined;
      this.flushReveal();
    });
  }
  private flushReveal() {
    const id = this.revealId;
    this.revealId = undefined;
    if (
      !this.closed &&
      this.active &&
      !this.navigation &&
      id &&
      id === this.selected
    )
      this.tree.reveal(id);
  }
  private buildPositions(
    page: number,
    offsets: Map<string, number | undefined>,
  ): PagePositions {
    const slots = new Map<number, Candidate>(),
      group = this.groups.get(page) ?? [];
    // 仅在页首书签确实缺少有效坐标时使用页级回退，不能给半页开始的标题伪造页顶起点。
    const firstOffset = group[0] && offsets.get(group[0].entry.id);
    if (firstOffset === undefined || !Number.isFinite(firstOffset)) {
      for (const candidate of this.fallback(page))
        slots.set(candidate.ratio, candidate);
    }
    for (const node of group) {
      const ratio = offsets.get(node.entry.id);
      if (ratio === undefined || !Number.isFinite(ratio)) continue;
      const candidate = {
          id: node.entry.id,
          ratio,
          depth: node.depth,
          order: node.order,
        },
        previous = slots.get(ratio);
      // 相同坐标优先更深标题，同深度按原书签顺序稳定选择。
      if (
        !previous ||
        candidate.depth > previous.depth ||
        (candidate.depth === previous.depth && candidate.order < previous.order)
      )
        slots.set(ratio, candidate);
    }
    return {
      offsets,
      candidates: [...slots.values()].sort((a, b) => a.ratio - b.ratio),
    };
  }
  private loadPage(page: number, rotation: number): Promise<void> {
    const key = this.key(page, rotation);
    if (this.closed || this.cache.has(key)) return Promise.resolve();
    if (
      this.resolving?.key === key &&
      !this.resolving.controller.signal.aborted
    )
      return this.resolving.promise;
    this.resolving?.controller.abort();
    const controller = new AbortController(),
      signal = controller.signal;
    const group = this.groups.get(page) ?? [],
      resolve = this.runtime.backend?.getOutlineOffset;
    const job = { key, controller, promise: Promise.resolve() };
    this.resolving = job;
    job.promise = Promise.resolve()
      .then(async () => {
        const offsets = new Map<string, number | undefined>();
        const located = group.filter((node) => node.entry.destination);
        // 每批限制等待数量；只换算一个书签页，避免全文预加载或大量并发。
        if (resolve)
          for (let start = 0; start < located.length; start += 32) {
            throwIfAborted(signal);
            const batch = await Promise.all(
              located.slice(start, start + 32).map(async (node) => {
                try {
                  return await resolve.call(
                    this.runtime.backend,
                    page,
                    node.entry.destination!,
                    rotation,
                    signal,
                  );
                } catch {
                  // 单个损坏书签回退为页级定位，不能阻断其余正常书签。
                  throwIfAborted(signal);
                  return undefined;
                }
              }),
            );
            throwIfAborted(signal);
            batch.forEach((ratio, index) =>
              offsets.set(located[start + index].entry.id, ratio),
            );
          }
        throwIfAborted(signal);
        this.cache.set(key, this.buildPositions(page, offsets));
      })
      .catch(() => {
        if (!signal.aborted && !this.closed)
          this.cache.set(key, {
            offsets: new Map(),
            candidates: this.fallback(page),
          });
      })
      .finally(() => {
        if (this.resolving === job) {
          this.resolving = undefined;
          if (!signal.aborted && !this.closed) this.sync();
        }
      });
    return job.promise;
  }
  private activate(id: string) {
    const node = this.nodes.get(id);
    if (!node || this.closed) return;
    this.cancelReveal();
    this.needsReveal = false;
    this.navigation?.controller.abort();
    const owned = { id, controller: new AbortController() };
    this.navigation = owned;
    this.explicit = { id, interaction: this.position.interaction };
    this.selected = id;
    this.publish();
    const finish = () => {
      if (this.navigation === owned) this.navigation = undefined;
    };
    const fail = (error: unknown) => {
      if (this.navigation !== owned || this.closed) return;
      finish();
      this.explicit = undefined;
      if (
        !owned.controller.signal.aborted &&
        (error as { name?: string })?.name !== 'AbortError'
      )
        this.runtime.onError?.(error);
      this.sync();
    };
    const move = () => {
      if (
        this.closed ||
        this.navigation !== owned ||
        owned.controller.signal.aborted
      )
        return;
      try {
        const ratio =
          this.cache.get(this.key(node.entry.pageIndex))?.offsets.get(id) ?? 0;
        const result = this.navigate(
          node.entry.pageIndex,
          ratio,
          owned.controller.signal,
        );
        if (result && typeof result.then === 'function')
          void result.then(finish, fail);
        else finish();
      } catch (error) {
        fail(error);
      }
    };
    if (
      node.entry.destination &&
      !this.cache.has(this.key(node.entry.pageIndex))
    )
      void this.loadPage(node.entry.pageIndex, this.position.rotation).then(
        move,
      );
    else move();
  }
  /** 每次阅读位置变化均同步，不等待工具栏页码跨页刷新。 */
  setReadingPosition(position: PdfReadingPosition): void {
    if (this.closed) return;
    const previous = this.position;
    if (
      this.navigation &&
      (position.interaction !== previous.interaction ||
        position.rotation !== previous.rotation)
    ) {
      this.navigation.controller.abort();
      this.navigation = undefined;
      this.explicit = undefined;
      this.resolving?.controller.abort();
    }
    this.position = position;
    if (
      position.pageIndex === previous.pageIndex &&
      position.ratio === previous.ratio &&
      position.rotation === previous.rotation &&
      position.interaction === previous.interaction
    )
      return;
    this.sync();
  }
  /** 保留原页码调用方式，页内精确跟随使用 setReadingPosition。 */
  setCurrentPage(index: number): void {
    this.setReadingPosition({ ...this.position, pageIndex: index, ratio: 0 });
  }
  /** 返回全文节点数，包含折叠后代及同页多个书签。 */
  getCount(): number {
    return this.nodes.size;
  }
  /** 更新提示语言，不改变定位状态。 */
  setLocale(locale?: 'zh-CN' | 'en-US'): void {
    this.tree.setLocale(locale);
  }
  /** 恢复时对齐最新位置，隐藏期间停止普通书签位置换算。 */
  setActive(active: boolean): void {
    if (this.closed || this.active === active) return;
    this.active = active;
    this.tree.setActive(active);
    if (active) this.sync(true);
    else {
      this.cancelReveal();
      if (!this.navigation) this.resolving?.controller.abort();
    }
  }
  /** 取消迟到坐标与导航，不释放由 PDF 会话拥有的引擎。 */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.cancelReveal();
    this.resolving?.controller.abort();
    this.navigation?.controller.abort();
    this.tree.dispose();
    this.nodes.clear();
    this.groups.clear();
    this.pages = [];
    this.cache.clear();
    this.entries = [];
    this.expanded.clear();
  }
}
