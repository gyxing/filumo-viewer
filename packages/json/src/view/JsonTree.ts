import type { TextDocument, TextMatch } from '@filumo/core/text';
import { findTextMatches } from '@filumo/core/text';
import { findJsonNodeAt } from '../parser/indexJson';
import { jsonPath } from '../parser/jsonPath';
import type { JsonDocument, JsonNode } from '../parser/types';
import './json.less';
import { jsonNodePreview, jsonNodeRange, jsonTreeGuides } from './treeRows';
interface Row {
  id: string;
  propertyId?: string;
  depth: number;
}
/** JSON 树按可见展开节点窗口化，折叠后代不生成 DOM。 */
export class JsonTree {
  readonly element: HTMLDivElement;
  private scroll: HTMLDivElement;
  private canvas: HTMLDivElement;
  private path: HTMLOutputElement;
  private find: HTMLDivElement;
  private query: HTMLInputElement;
  private count: HTMLOutputElement;
  private rows: Row[] = [];
  private expanded = new Set<string>();
  private selected: string;
  private searchAbort = new AbortController();
  private matches: TextMatch[] = [];
  private matchIndex = -1;
  private resize?: ResizeObserver;
  private active = true;
  private height: number;
  private branchKey = '';
  constructor(
    private model: JsonDocument,
    private text: TextDocument,
    private document: Document,
    depth: number,
    zoom: number,
    private en: boolean,
    private onStateChange?: () => void,
    private onReveal?: (range: { start: number; end: number }) => void,
  ) {
    this.selected = model.rootId;
    this.height = (24 * zoom) / 100;
    this.element = document.createElement('div');
    this.element.className = 'filumo-json-tree';
    this.element.style.fontSize = (14 * zoom) / 100 + 'px';
    this.find = document.createElement('div');
    this.find.className = 'filumo-json-find';
    this.find.hidden = true;
    this.query = document.createElement('input');
    this.query.type = 'search';
    this.query.placeholder = en ? 'Find keys or values' : '查找键或值';
    this.query.setAttribute('aria-label', this.query.placeholder);
    this.count = document.createElement('output');
    this.count.setAttribute('role', 'status');
    const button = (label: string, action: () => void) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.textContent = label;
      node.onclick = action;
      return node;
    };
    this.find.append(
      this.query,
      button(en ? 'Previous' : '上一项', () => this.moveMatch(-1)),
      button(en ? 'Next' : '下一项', () => this.moveMatch(1)),
      this.count,
      button(en ? 'Close' : '关闭', () => {
        this.find.hidden = true;
        this.searchAbort.abort();
      }),
    );
    this.query.oninput = () => {
      void this.search();
    };
    this.query.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.moveMatch(event.shiftKey ? -1 : 1);
      }
    };
    this.scroll = document.createElement('div');
    this.scroll.className = 'filumo-json-scroll';
    this.scroll.tabIndex = 0;
    this.scroll.setAttribute('role', 'tree');
    this.scroll.setAttribute('aria-label', en ? 'JSON structure' : 'JSON 结构');
    this.canvas = document.createElement('div');
    this.canvas.className = 'filumo-json-canvas';
    this.scroll.append(this.canvas);
    this.path = document.createElement('output');
    this.path.className = 'filumo-json-path';
    this.path.textContent = '/';
    this.element.append(this.find, this.scroll, this.path);
    this.element.onkeydown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        this.showSearch();
      }
      if (event.key === 'Escape') {
        this.find.hidden = true;
        this.searchAbort.abort();
        this.scroll.focus();
      }
    };
    const stack: Array<{ id: string; depth: number }> = [
      { id: model.rootId, depth: 0 },
    ];
    while (stack.length) {
      const current = stack.pop()!,
        node = this.node(current.id);
      if (
        current.depth < depth &&
        node.childIds.length &&
        ['object', 'array'].includes(node.type)
      ) {
        this.expanded.add(node.id);
        for (const child of this.children(node))
          stack.push({ id: child.id, depth: current.depth + 1 });
      }
    }
    this.scroll.onscroll = () => this.render();
    this.scroll.onkeydown = this.key;
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      this.resize = new Resize(() => this.render());
      this.resize.observe(this.scroll);
    }
    this.rebuild();
  }
  private node(id: string) {
    return this.model.nodes[Number(id)];
  }
  private children(node: JsonNode) {
    return node.childIds.map((id) => {
      const child = this.node(id);
      return child.type === 'property' ? this.node(child.childIds[0]) : child;
    });
  }
  private rebuild() {
    this.rows = [];
    const stack: Row[] = [{ id: this.model.rootId, depth: 0 }];
    while (stack.length) {
      const row = stack.pop()!,
        node = this.node(row.id);
      this.rows.push(row);
      if (this.expanded.has(node.id)) {
        const children = this.children(node);
        for (let i = children.length - 1; i >= 0; i--) {
          const child = children[i],
            parent =
              child.parentId === undefined
                ? undefined
                : this.node(child.parentId);
          stack.push({
            id: child.id,
            propertyId: parent?.type === 'property' ? parent.id : undefined,
            depth: row.depth + 1,
          });
        }
      }
    }
    this.canvas.style.height = this.rows.length * this.height + 'px';
    this.render();
  }
  private render() {
    if (!this.active) return;
    this.path.textContent =
      jsonPath(this.model, this.selected) || (this.en ? '(root)' : '根节点');
    const focused = this.canvas.contains(this.document.activeElement);
    const first = Math.max(
      0,
      Math.floor(this.scroll.scrollTop / this.height) - 3,
    );
    const end = Math.min(
      this.rows.length,
      first + Math.ceil((this.scroll.clientHeight || 400) / this.height) + 6,
    );
    this.canvas.replaceChildren();
    for (let index = first; index < end; index++) {
      const row = this.rows[index],
        node = this.node(row.id),
        item = this.document.createElement('div');
      item.className = 'filumo-json-row';
      item.setAttribute('role', 'treeitem');
      item.dataset.nodeId = node.id;
      item.style.top = index * this.height + 'px';
      item.style.height = this.height + 'px';
      item.style.paddingLeft = '8px';
      item.tabIndex = node.id === this.selected ? 0 : -1;
      item.setAttribute('aria-level', String(row.depth + 1));
      item.setAttribute('aria-selected', String(node.id === this.selected));
      const container =
        (node.type === 'object' || node.type === 'array') &&
        node.childIds.length > 0;
      if (container)
        item.setAttribute('aria-expanded', String(this.expanded.has(node.id)));
      const guides = jsonTreeGuides(this.model, node.id);
      guides.forEach((continued, level) => {
        const guide = this.document.createElement('span');
        guide.className = 'filumo-json-guide';
        guide.dataset.continued = String(continued);
        guide.dataset.branch = String(level === guides.length - 1);
        guide.setAttribute('aria-hidden', 'true');
        item.append(guide);
      });
      const toggle = this.document.createElement('span');
      toggle.className = 'filumo-json-toggle';
      toggle.dataset.open = String(this.expanded.has(node.id));
      toggle.dataset.branch = String(container);
      toggle.setAttribute('aria-hidden', 'true');
      const key = this.document.createElement('span');
      key.className = 'filumo-json-key';
      if (row.propertyId) key.textContent = this.node(row.propertyId).key ?? '';
      else if (
        node.parentId !== undefined &&
        this.node(node.parentId).type === 'array'
      )
        key.textContent = String(
          this.node(node.parentId).childIds.indexOf(node.id),
        );
      const value = this.document.createElement('span');
      value.className = 'filumo-json-value filumo-json-value--' + node.type;
      value.textContent = jsonNodePreview(this.model, node);
      const title = this.document.createElement('span');
      title.className = 'filumo-json-title';
      if (key.textContent) {
        const separator = this.document.createElement('span');
        separator.className = 'filumo-json-separator';
        separator.textContent = ':';
        title.append(key, separator);
      } else if (row.propertyId) {
        key.textContent = '""';
        const separator = this.document.createElement('span');
        separator.className = 'filumo-json-separator';
        separator.textContent = ':';
        title.append(key, separator);
      }
      title.append(value);
      item.append(toggle, title);
      item.onclick = (event) => {
        const selection = this.document.defaultView?.getSelection();
        if (
          selection &&
          !selection.isCollapsed &&
          this.canvas.contains(selection.anchorNode)
        )
          return;
        const changed = this.selected !== node.id;
        this.selected = node.id;
        if (container && event.target === toggle) this.toggle(node.id);
        else this.updateSelection();
        if (event.target !== toggle || changed)
          this.onReveal?.(jsonNodeRange(this.model, node.id));
      };
      this.canvas.append(item);
      if (focused && node.id === this.selected)
        item.focus({ preventScroll: true });
    }
    this.reportState();
  }
  private updateSelection() {
    this.path.textContent =
      jsonPath(this.model, this.selected) || (this.en ? '(root)' : '根节点');
    for (const child of Array.from(this.canvas.children)) {
      const row = child as HTMLElement;
      row.setAttribute(
        'aria-selected',
        String(row.dataset.nodeId === this.selected),
      );
      row.tabIndex = row.dataset.nodeId === this.selected ? 0 : -1;
    }
    this.reportState();
  }
  private reportState() {
    // 仅选中对象或展开状态改变时通知外壳，滚动重绘不重复刷新工具栏。
    const state = this.getBranchState();
    const key = this.selected + ':' + state.canToggle + ':' + state.expanded;
    if (key !== this.branchKey) {
      this.branchKey = key;
      this.onStateChange?.();
    }
  }
  private toggle(id: string) {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.rebuild();
  }
  private key = (event: KeyboardEvent) => {
    const previous = this.selected;
    const index = this.rows.findIndex((row) => row.id === this.selected),
      node = this.node(this.selected);
    if (
      [
        'ArrowRight',
        'ArrowLeft',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
      ].includes(event.key)
    )
      event.preventDefault();
    else return;
    let next = index;
    if (event.key === 'ArrowDown') next++;
    if (event.key === 'ArrowUp') next--;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = this.rows.length - 1;
    if (event.key === 'ArrowRight') {
      if (!this.expanded.has(node.id) && node.childIds.length)
        this.toggle(node.id);
      else if (node.childIds.length) next++;
    }
    if (event.key === 'ArrowLeft') {
      if (this.expanded.has(node.id)) this.toggle(node.id);
      else {
        let parent =
          node.parentId === undefined ? undefined : this.node(node.parentId);
        if (parent?.type === 'property')
          parent =
            parent.parentId === undefined
              ? undefined
              : this.node(parent.parentId);
        if (parent) next = this.rows.findIndex((row) => row.id === parent!.id);
      }
    }
    const row = this.rows[Math.max(0, Math.min(this.rows.length - 1, next))];
    if (row) {
      this.selected = row.id;
      this.scroll.scrollTop = Math.max(
        0,
        this.rows.findIndex((r) => r.id === row.id) * this.height -
          this.scroll.clientHeight / 2,
      );
      this.render();
      this.canvas
        .querySelector<HTMLElement>('[data-node-id="' + row.id + '"]')
        ?.focus();
      if (previous !== this.selected)
        this.onReveal?.(jsonNodeRange(this.model, this.selected));
    }
  };
  private async search() {
    this.searchAbort.abort();
    const controller = (this.searchAbort = new AbortController());
    this.matches = [];
    this.matchIndex = -1;
    try {
      for await (const batch of findTextMatches(
        this.text,
        this.query.value,
        { matchCase: false, wholeWord: false },
        controller.signal,
      )) {
        if (!this.active || controller.signal.aborted) return;
        this.matches.push(...batch);
        this.count.textContent = String(this.matches.length);
      }
      if (this.matches.length) this.moveMatch(1);
      else this.count.textContent = this.en ? 'No matches' : '未找到';
    } catch (error) {
      if (!controller.signal.aborted) this.count.textContent = String(error);
    }
  }
  private moveMatch(delta: number) {
    if (!this.matches.length) return;
    this.matchIndex =
      (this.matchIndex + delta + this.matches.length) % this.matches.length;
    let node = findJsonNodeAt(this.model, this.matches[this.matchIndex].start);
    if (node.type === 'property') node = this.node(node.childIds[0]);
    this.selected = node.id;
    let parent: JsonNode | undefined = node;
    while (parent?.parentId !== undefined) {
      parent = this.node(parent.parentId);
      this.expanded.add(parent.id);
    }
    this.rebuild();
    const index = this.rows.findIndex((row) => row.id === node.id);
    this.scroll.scrollTop = Math.max(
      0,
      index * this.height - this.scroll.clientHeight / 2,
    );
    this.path.textContent = jsonPath(this.model, node.id);
    this.count.textContent = this.matchIndex + 1 + ' / ' + this.matches.length;
    this.render();
    this.onReveal?.({
      start: this.matches[this.matchIndex].start,
      end: this.matches[this.matchIndex].end,
    });
  }
  /** 工具栏查找不会在打开前生成查询结果。 */
  showSearch() {
    this.find.hidden = false;
    this.query.focus();
  }
  /** 单个按钮使用真实选中分支状态，基础值和空容器不能展开。 */
  getBranchState() {
    const node = this.node(this.selected);
    const canToggle =
      (node.type === 'object' || node.type === 'array') &&
      node.childIds.length > 0;
    return { canToggle, expanded: canToggle && this.expanded.has(node.id) };
  }
  /** 只切换当前分支，保留其他分支及已收起节点的后代展开状态。 */
  toggleSelected() {
    if (this.getBranchState().canToggle) this.toggle(this.selected);
  }
  /** 复制路径使用节点身份，不把重复键合并为对象。 */
  getPath() {
    return jsonPath(this.model, this.selected);
  }
  /** 字号变化保持已展开分支和当前滚动行。 */
  setZoom(zoom: number) {
    if (this.height === (24 * zoom) / 100) return;
    const row = this.scroll.scrollTop / this.height;
    this.height = (24 * zoom) / 100;
    this.element.style.fontSize = (14 * zoom) / 100 + 'px';
    this.canvas.style.height = this.rows.length * this.height + 'px';
    this.scroll.scrollTop = row * this.height;
    this.render();
  }
  /** 模式切换只保存轻量显示状态，不保留整棵 DOM。 */
  getState() {
    return {
      expanded: [...this.expanded],
      selected: this.selected,
      top: this.scroll.scrollTop,
    };
  }
  restoreState(state: { expanded: string[]; selected: string; top: number }) {
    this.expanded = new Set(state.expanded);
    this.selected = state.selected;
    this.rebuild();
    this.scroll.scrollTop = state.top;
    this.render();
  }
  /** 停用不销毁模型，但停止搜索和测量。 */
  setActive(active: boolean) {
    this.active = active;
    if (!active) {
      this.searchAbort.abort();
      this.resize?.disconnect();
    } else {
      this.resize?.observe(this.scroll);
      this.render();
    }
  }
  /** 释放当前树的事件和观察器。 */
  dispose() {
    this.setActive(false);
    this.element.remove();
  }
}
