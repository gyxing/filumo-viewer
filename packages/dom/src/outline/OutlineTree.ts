import { useStyles } from '../styles';
// 将样式绑定到实际视图模块，避免转导出优化跳过入口中的副作用导入。
import '../outline.less';
import type {
  OutlineRevealOptions,
  OutlineRow,
  OutlineSnapshot,
  OutlineTreeOptions,
} from './contracts';
import { OUTLINE_DEFAULTS as SIZE } from './defaults';
import { buildOutlineRows } from './treeRows';

/** 文档大纲的公共树视图；格式状态与正文导航由调用方持有。 */
export class OutlineTree<TNode> {
  readonly element: HTMLElement;
  private rowHeight: number = SIZE.rowHeight;
  private canvas: HTMLElement;
  private rows: OutlineRow<TNode>[] = [];
  private indices = new Map<string, number>();
  private revision?: number;
  private selected?: string;
  private focused?: string;
  private active = true;
  private closed = false;
  private locale?: 'zh-CN' | 'en-US';
  private frame?: number;
  private observer?: ResizeObserver;
  private release: () => void;
  private pendingReveal?: { id: string; options: OutlineRevealOptions };

  constructor(private options: OutlineTreeOptions<TNode>) {
    const document = options.document;
    this.element = document.createElement('div');
    this.element.className = 'filumo-outline-tree';
    this.element.setAttribute('role', 'tree');
    this.element.tabIndex = 0;
    for (const [name, value] of Object.entries({
      'row-height': this.rowHeight,
      indent: SIZE.indent,
      'switcher-width': SIZE.switcherWidth,
      'icon-size': SIZE.iconSize,
    }))
      this.element.style.setProperty('--filumo-outline-' + name, value + 'px');
    this.canvas = document.createElement('div');
    this.canvas.className = 'filumo-outline-canvas';
    this.element.append(this.canvas);
    this.element.onscroll = this.schedule;
    // 样式策略失败时尚未注册观察器，构造失败不会留下活动资源。
    this.release = useStyles('dom', document, options.stylePolicy);
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      this.observer = new Resize(this.schedule);
      this.observer.observe(this.element);
    }
    this.setLocale(options.locale);
  }

  /** 快照更新不会激活正文；只有结构版本变化才重新建立可见行索引。 */
  update(snapshot: OutlineSnapshot<TNode>): void {
    if (this.closed) return;
    this.selected = snapshot.selectedId;
    if (this.revision !== snapshot.revision) {
      const hadFocus = this.element.contains(
        this.element.ownerDocument.activeElement,
      );
      const previousFocus = this.focused;
      const oldRows = this.rows,
        oldIndices = this.indices;
      this.rows = buildOutlineRows(snapshot, this.options.accessors);
      this.indices = new Map(this.rows.map((row, index) => [row.id, index]));
      this.revision = snapshot.revision;
      // 被折叠节点先回退到仍可见的祖先，不能把焦点留在已移除的 DOM 上。
      while (this.focused && !this.indices.has(this.focused)) {
        const index = oldIndices.get(this.focused);
        this.focused =
          index === undefined ? undefined : oldRows[index].parentId;
      }
      this.canvas.style.height = this.rows.length * this.rowHeight + 'px';
      const height = this.element.clientHeight;
      if (height > 0)
        this.element.scrollTop = Math.max(
          0,
          Math.min(
            this.element.scrollTop,
            this.rows.length * this.rowHeight - height,
          ),
        );
      if (hadFocus && previousFocus !== this.focused && this.focused)
        this.position(this.focused, {});
    }
    this.element.setAttribute('aria-busy', String(snapshot.loading.size > 0));
    this.render();
  }

  private schedule = () => {
    if (this.closed || !this.active || this.frame !== undefined) return;
    const window = this.element.ownerDocument.defaultView;
    if (window)
      this.frame = window.requestAnimationFrame(() => {
        this.frame = undefined;
        this.render();
      });
    else this.render();
  };

  private row(id?: string): OutlineRow<TNode> | undefined {
    const index = id === undefined ? undefined : this.indices.get(id);
    return index === undefined ? undefined : this.rows[index];
  }

  private render() {
    if (this.closed || !this.active) return;
    if (this.pendingReveal && this.element.clientHeight > 0) {
      const pending = this.pendingReveal;
      this.pendingReveal = undefined;
      this.position(pending.id, pending.options);
    }
    const document = this.element.ownerDocument;
    const focusInside = this.element.contains(document.activeElement);
    const begin = Math.max(
      0,
      Math.floor(this.element.scrollTop / this.rowHeight) - SIZE.overscan,
    );
    const end = Math.min(
      this.rows.length,
      Math.ceil(
        (this.element.scrollTop + (this.element.clientHeight || 400)) /
          this.rowHeight,
      ) + SIZE.overscan,
    );
    const focusedIndex =
      this.focused === undefined ? undefined : this.indices.get(this.focused);
    if (
      focusedIndex === undefined ||
      focusedIndex < begin ||
      focusedIndex >= end
    ) {
      const selectedIndex =
        this.selected === undefined
          ? undefined
          : this.indices.get(this.selected);
      this.focused =
        selectedIndex !== undefined &&
        selectedIndex >= begin &&
        selectedIndex < end
          ? this.selected
          : this.rows[begin]?.id;
    }
    this.element.tabIndex = this.rows.length ? -1 : 0;
    this.canvas.replaceChildren();
    for (let index = begin; index < end; index++) {
      const item = this.rows[index],
        row = document.createElement('div');
      row.className = 'filumo-outline-row';
      row.dataset.outlineId = item.id;
      row.style.top = index * this.rowHeight + 'px';
      row.style.paddingLeft = item.depth * SIZE.indent + 'px';
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-label', item.text);
      row.setAttribute('aria-level', String(item.depth + 1));
      row.setAttribute('aria-posinset', String(item.siblingIndex + 1));
      row.setAttribute('aria-setsize', String(item.siblingCount));
      row.setAttribute('aria-selected', String(item.id === this.selected));
      if (!item.isLeaf)
        row.setAttribute('aria-expanded', String(item.expanded));
      row.tabIndex = item.id === this.focused ? 0 : -1;
      row.onfocus = () => {
        this.focused = item.id;
      };
      row.onkeydown = (event) => this.key(event, item);
      row.onclick = () => {
        this.focused = item.id;
        row.focus({ preventScroll: true });
        this.options.onActivate(item.id);
      };
      const guides = document.createElement('span');
      guides.className = 'filumo-outline-guides';
      guides.setAttribute('aria-hidden', 'true');
      // 根节点的后续兄弟也需要贯穿当前子树，不能只绘制内部祖先线。
      item.ancestorHasNextSibling.forEach((continues, level) => {
        if (!continues) return;
        const guide = document.createElement('span');
        guide.className = 'filumo-outline-guide';
        guide.dataset.root = String(level === 0);
        guide.style.left = level * SIZE.indent + SIZE.iconSize / 2 + 'px';
        guides.append(guide);
      });
      const branch = document.createElement('span');
      branch.className = 'filumo-outline-branch';
      branch.dataset.continues = String(item.hasNextSibling);
      branch.dataset.leaf = String(item.isLeaf);
      branch.dataset.root = String(item.depth === 0);
      branch.dataset.first = String(item.siblingIndex === 0);
      // 图标靠左摆放后的中心，与本级竖线及父节点横线末端采用同一轴线。
      branch.style.left = item.depth * SIZE.indent + SIZE.iconSize / 2 + 'px';
      guides.append(branch);
      // 子级竖线直接从父行横线末端向下，不在首个子节点行回接父级主干。
      if (item.expanded && this.rows[index + 1]?.parentId === item.id) {
        const connector = document.createElement('span');
        connector.className = 'filumo-outline-child-connector';
        connector.style.left =
          (item.depth + 1) * SIZE.indent + SIZE.iconSize / 2 + 'px';
        guides.append(connector);
      }
      row.append(guides);
      if (item.isLeaf) {
        const space = document.createElement('span');
        space.className = 'filumo-outline-leaf';
        space.setAttribute('aria-hidden', 'true');
        row.append(space);
      } else {
        const switcher = document.createElement('button'),
          icon = document.createElement('span');
        switcher.type = 'button';
        switcher.tabIndex = -1;
        switcher.className = 'filumo-outline-switcher';
        switcher.dataset.expanded = String(item.expanded);
        switcher.dataset.loading = String(item.loading);
        switcher.setAttribute(
          'aria-label',
          (item.expanded
            ? this.locale === 'en-US'
              ? 'Collapse '
              : '收起 '
            : this.locale === 'en-US'
            ? 'Expand '
            : '展开 ') + item.text,
        );
        icon.setAttribute('aria-hidden', 'true');
        switcher.append(icon);
        switcher.onclick = (event) => {
          event.stopPropagation();
          this.focused = item.id;
          row.focus({ preventScroll: true });
          this.options.onToggle(item.id, !item.expanded);
        };
        row.append(switcher);
      }
      const label = document.createElement('span');
      label.className = 'filumo-outline-label';
      label.title = item.text;
      const content = this.options.renderLabel?.(item.node, document);
      if (content) label.append(content);
      else label.textContent = item.text;
      row.append(label);
      this.canvas.append(row);
      if (focusInside && item.id === this.focused)
        row.focus({ preventScroll: true });
    }
    if (focusInside && !this.rows.length)
      this.element.focus({ preventScroll: true });
  }

  private key(event: KeyboardEvent, row: OutlineRow<TNode>) {
    const index = this.indices.get(row.id)!;
    let next: string | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = this.rows[Math.min(this.rows.length - 1, index + 1)]?.id;
        break;
      case 'ArrowUp':
        next = this.rows[Math.max(0, index - 1)]?.id;
        break;
      case 'Home':
        next = this.rows[0]?.id;
        break;
      case 'End':
        next = this.rows[this.rows.length - 1]?.id;
        break;
      case 'ArrowRight':
        if (!row.isLeaf && !row.expanded) this.options.onToggle(row.id, true);
        else if (this.rows[index + 1]?.parentId === row.id)
          next = this.rows[index + 1].id;
        break;
      case 'ArrowLeft':
        if (!row.isLeaf && row.expanded) this.options.onToggle(row.id, false);
        else next = row.parentId;
        break;
      case 'Enter':
      case ' ':
        this.options.onActivate(row.id);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (next) this.reveal(next, { focus: true });
  }

  private position(id: string, options: OutlineRevealOptions) {
    const index = this.indices.get(id),
      height = this.element.clientHeight;
    if (index === undefined || height <= 0) return;
    const top = index * this.rowHeight;
    if (options.align === 'reading') {
      const middle = top + this.rowHeight / 2 - this.element.scrollTop;
      if (middle < height * 0.25 || middle > height * 0.6)
        this.element.scrollTop = Math.max(
          0,
          top + this.rowHeight / 2 - height * 0.4,
        );
    } else if (top < this.element.scrollTop) this.element.scrollTop = top;
    else if (top + this.rowHeight > this.element.scrollTop + height)
      this.element.scrollTop = Math.max(0, top + this.rowHeight - height);
    if (options.focus) this.focused = id;
  }

  /** 只显示已加载且可见的节点，不读取数据或改变格式层展开状态。 */
  reveal(id: string, options: OutlineRevealOptions = {}): void {
    if (this.closed || !this.indices.has(id)) return;
    if (!this.active || this.element.clientHeight <= 0) {
      this.pendingReveal = { id, options: { ...options, focus: false } };
      return;
    }
    this.position(id, options);
    this.render();
    if (options.focus)
      for (const node of Array.from(this.canvas.children))
        if ((node as HTMLElement).dataset.outlineId === id)
          (node as HTMLElement).focus({ preventScroll: true });
  }
  /** 调整结构阅读字号时同步测量行高，未调用的文档大纲保持默认尺寸。 */
  setScale(scale: number): void {
    if (this.closed || !Number.isFinite(scale) || scale <= 0) return;
    const height = SIZE.rowHeight * scale;
    if (height === this.rowHeight) return;
    const anchor = this.element.scrollTop / this.rowHeight;
    this.rowHeight = height;
    this.element.style.setProperty('--filumo-outline-row-height', height + 'px');
    this.canvas.style.height = this.rows.length * height + 'px';
    this.element.scrollTop = anchor * height;
    this.render();
  }
  /** 将焦点交给当前选择或可见行，不触发正文定位。 */
  focus(): void {
    if (this.closed || !this.active) return;
    if (this.row(this.selected)) this.reveal(this.selected!, { focus: true });
    else if (this.focused) this.reveal(this.focused, { focus: true });
    else this.element.focus({ preventScroll: true });
  }
  /** 切换提示语言不重置树结构或滚动位置。 */
  setLocale(locale?: 'zh-CN' | 'en-US'): void {
    if (
      this.closed ||
      (this.locale === locale && this.element.getAttribute('aria-label'))
    )
      return;
    this.locale = locale;
    this.element.setAttribute(
      'aria-label',
      locale === 'en-US' ? 'Headings' : '大纲条目',
    );
    this.render();
  }
  /** 非活动侧栏停止测量和帧调度，保留快照及位置。 */
  setActive(active: boolean): void {
    if (this.closed) return;
    this.active = active;
    if (active) {
      this.observer?.observe(this.element);
      this.render();
    } else {
      this.observer?.disconnect();
      if (this.frame !== undefined)
        this.element.ownerDocument.defaultView?.cancelAnimationFrame(
          this.frame,
        );
      this.frame = undefined;
    }
  }
  /** 只释放树自身资源，格式 Provider 和 Backend 仍由适配层拥有。 */
  dispose(): void {
    if (this.closed) return;
    this.setActive(false);
    this.closed = true;
    this.element.onscroll = null;
    this.observer?.disconnect();
    this.release();
    this.rows = [];
    this.indices.clear();
    this.element.remove();
  }
}
