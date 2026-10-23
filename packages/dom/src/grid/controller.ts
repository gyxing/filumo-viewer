import type {
  GridInteractionOptions,
  GridPoint,
  GridRange,
  GridState,
} from './contracts';
import { clampGridPoint, GridSelection, validGridRange } from './selection';
import { serializeGridSelection } from './clipboard';
import { gridKeyboardTarget } from './keyboard';
import { gridInteractiveTarget, GridPointer } from './pointer';
import { GridTextSelection } from './textSelection';
import { gridMessages } from './messages';
import { useStyles as acquireStyles } from '../styles';
import '../grid.less';

const GRID_SEQUENCE = Symbol.for('filumo.grid.instance-sequence');
/** 同一文档中的不同模块副本也共享编号，避免多版本 DOM 的活动节点 ID 冲突。 */
function nextGridId(document: Document): string {
  const owner = document as Document & { [GRID_SEQUENCE]?: number };
  owner[GRID_SEQUENCE] = (owner[GRID_SEQUENCE] ?? 0) + 1;
  return 'filumo-grid-' + owner[GRID_SEQUENCE];
}
/** 格式无关的只读交互控制器，覆盖层与源单元格样式相互独立。 */
export class GridInteractionController {
  readonly selection: GridSelection;
  private layer: HTMLElement;
  private pointer?: GridPointer;
  private copying = new AbortController();
  private active = false;
  private closed = false;
  private revision: string | number;
  private announced = '';
  private overlayParent?: HTMLElement;
  private positionedParent = false;
  private id: string;
  private releaseStyles: () => void;
  private textSelection: GridTextSelection;
  constructor(private options: GridInteractionOptions) {
    const { host, adapter } = options;
    this.id = nextGridId(host.ownerDocument);
    this.selection = new GridSelection(options.state);
    this.revision = adapter.revision();
    // 每个网格拥有样式租约，独立使用子入口时也遵循 external 和 CSP 策略。
    this.releaseStyles = acquireStyles(
      'dom',
      host.ownerDocument,
      options.stylePolicy,
    );
    this.layer = host.ownerDocument.createElement('div');
    this.layer.className = 'filumo-grid-selection-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    host.append(this.layer);
    host.classList.add('filumo-grid-interaction');
    host.tabIndex = 0;
    host.setAttribute('role', 'grid');
    host.setAttribute('aria-readonly', 'true');
    host.addEventListener('keydown', this.key);
    host.addEventListener('scroll', this.refresh, { passive: true });
    this.textSelection = new GridTextSelection(host, (active) => {
      this.layer.hidden = !this.active || active;
      options.onTextSelectionChange?.(active);
    });
    try {
      this.setActive(true);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  get range(): GridRange | undefined {
    const bounds = this.options.adapter.bounds(),
      range = this.selection.range;
    if (!range || !validGridRange(bounds)) return undefined;
    const normalized = this.options.adapter.normalize?.(range) ?? range;
    return {
      startRow: Math.max(bounds.startRow, normalized.startRow),
      endRow: Math.min(bounds.endRow, normalized.endRow),
      startColumn: Math.max(bounds.startColumn, normalized.startColumn),
      endColumn: Math.min(bounds.endColumn, normalized.endColumn),
    };
  }
  select(point: GridPoint, extend = false, reveal = true): void {
    this.textSelection.clear();
    this.applySelection(point, extend, reveal);
  }
  private applySelection(
    point: GridPoint,
    extend: boolean,
    reveal: boolean,
  ): void {
    if (!this.active || this.closed) return;
    const adapter = this.options.adapter,
      bounds = adapter.bounds();
    if (!validGridRange(bounds)) return;
    const target = adapter.point
      ? adapter.point(clampGridPoint(point, bounds))
      : clampGridPoint(point, bounds);
    if (!target) return;
    this.selection.select(target, extend, bounds);
    if (reveal) adapter.reveal(target);
    this.refresh();
  }
  getState(): GridState {
    return this.selection.getState();
  }
  /** 原生选字时复用单元格，避免虚拟化刷新销毁浏览器 Range。 */
  get hasTextSelection(): boolean {
    return this.textSelection.active;
  }
  /** 判断节点是否仍被当前原生文字范围使用，供格式视图延后回收。 */
  preservesText(node: Node): boolean {
    return this.textSelection.preserves(node);
  }
  /** 显式导航或切换排版前结束本表格的原生选择。 */
  clearTextSelection(): void {
    this.textSelection.clear();
  }
  /** 只在选择改变时通知格式层，普通滚动和重绘不会重新导航。 */
  refresh = () => {
    if (!this.active || this.closed) return;
    const { host, adapter } = this.options;
    const revision = adapter.revision();
    if (revision !== this.revision) {
      this.textSelection.clear();
      this.copying.abort();
      this.pointer?.cancel();
      this.revision = revision;
    }
    const bounds = adapter.bounds();
    this.selection.clamp(bounds);
    if (this.selection.focus && adapter.point && bounds) {
      const focus = adapter.point(this.selection.focus);
      const anchor =
        this.selection.anchor && adapter.point(this.selection.anchor);
      if (focus && anchor) {
        this.selection.anchor = anchor;
        this.selection.focus = focus;
      } else this.selection.clamp(undefined);
    }
    const range = this.range;
    const state = this.selection.getState(),
      signature = JSON.stringify(state);
    if (signature !== this.announced) {
      this.copying.abort();
      this.announced = signature;
      adapter.changed?.(state);
    }
    host.setAttribute('aria-rowcount', String(bounds ? bounds.endRow + 1 : 0));
    host.setAttribute(
      'aria-colcount',
      String(bounds ? bounds.endColumn + 1 : 0),
    );
    // 覆盖层放在稳定父容器，避免绝对定位子节点把滚动范围越撑越大。
    const parent = host.parentElement;
    if (parent && parent !== this.overlayParent) {
      this.overlayParent = parent;
      const position =
        host.ownerDocument.defaultView?.getComputedStyle(parent).position;
      this.positionedParent = !position || position === 'static';
      if (this.positionedParent)
        parent.classList.add('filumo-grid-overlay-host');
      parent.append(this.layer);
    }
    this.layer.style.left =
      (parent ? host.offsetLeft + host.clientLeft : host.scrollLeft) + 'px';
    this.layer.style.top =
      (parent ? host.offsetTop + host.clientTop : host.scrollTop) + 'px';
    this.layer.style.width = host.clientWidth + 'px';
    this.layer.style.height = host.clientHeight + 'px';
    this.layer.replaceChildren();
    const draw = (value: GridRange, active: boolean) => {
      for (const rect of adapter.rects(value)) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const node = host.ownerDocument.createElement('div');
        node.className = active
          ? 'filumo-grid-active-cell'
          : 'filumo-grid-selection';
        Object.assign(node.style, {
          left: rect.left + 'px',
          top: rect.top + 'px',
          width: rect.width + 'px',
          height: rect.height + 'px',
        });
        this.layer.append(node);
      }
    };
    if (range) draw(range, false);
    const focus = this.selection.focus;
    if (focus) {
      const cell = {
        startRow: focus.row,
        endRow: focus.row,
        startColumn: focus.column,
        endColumn: focus.column,
      };
      draw(adapter.normalize?.(cell) ?? cell, true);
    }
    host.removeAttribute('aria-activedescendant');
    let ordinal = 0,
      activeId = '';
    for (const node of host.querySelectorAll<HTMLElement>(
      '[data-grid-row][data-grid-column]',
    )) {
      const row = Number(node.dataset.gridRow),
        column = Number(node.dataset.gridColumn);
      node.id = this.id + '-' + row + '-' + column + '-' + ordinal++;
      node.setAttribute('role', 'gridcell');
      node.setAttribute('aria-rowindex', String(row + 1));
      node.setAttribute('aria-colindex', String(column + 1));
      node.setAttribute(
        'aria-selected',
        String(
          !!range &&
            row >= range.startRow &&
            row <= range.endRow &&
            column >= range.startColumn &&
            column <= range.endColumn,
        ),
      );
      if (focus?.row === row && focus.column === column && !activeId)
        activeId = node.id;
    }
    if (activeId) host.setAttribute('aria-activedescendant', activeId);
    for (const node of host.querySelectorAll<HTMLElement>(
      '[data-grid-header-column]',
    )) {
      const column = Number(node.dataset.gridHeaderColumn);
      node.dataset.gridHighlighted = String(
        !!range && column >= range.startColumn && column <= range.endColumn,
      );
    }
  };
  /** 复制绑定当前内容版本和选择，旧异步任务不会写入新会话剪贴板。 */
  async copy(): Promise<void> {
    const range = this.range;
    if (!this.active || this.closed || !range) return;
    this.copying.abort();
    const own = (this.copying = new AbortController()),
      revision = this.options.adapter.revision();
    const text = await serializeGridSelection(
      range,
      this.options.adapter.readRows(range, own.signal),
      own.signal,
      { locale: this.options.locale },
    );
    if (
      own.signal.aborted ||
      this.closed ||
      !this.active ||
      revision !== this.options.adapter.revision()
    )
      return;
    const clipboard =
      this.options.host.ownerDocument.defaultView?.navigator.clipboard;
    if (!clipboard)
      throw new Error(gridMessages(this.options.locale).unavailable);
    await clipboard.writeText(text);
  }
  private key = (event: KeyboardEvent) => {
    if (
      !this.active ||
      this.closed ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      gridInteractiveTarget(event.target)
    )
      return;
    const adapter = this.options.adapter,
      bounds = adapter.bounds(),
      focus = this.selection.focus;
    const control = event.ctrlKey || event.metaKey,
      key = event.key.toLowerCase();
    if (control && key === 'f') {
      if (this.options.search) {
        this.textSelection.clear();
        event.preventDefault();
        this.options.search();
      }
      return;
    }
    if (control && key === 'c') {
      if (this.options.host.ownerDocument.getSelection()?.isCollapsed === false)
        return;
      event.preventDefault();
      void this.copy().catch((error) => {
        if ((error as Error)?.name !== 'AbortError')
          this.options.onError(error);
      });
      return;
    }
    if (event.key === 'Escape') {
      this.textSelection.clear();
      this.pointer?.cancel();
      this.copying.abort();
      return;
    }
    if (!validGridRange(bounds) || !focus) return;
    if (control && key === 'a') {
      event.preventDefault();
      this.textSelection.clear();
      this.selection.selectAll(bounds);
      this.refresh();
      return;
    }
    if (this.textSelection.active) return;
    const target = adapter.move
      ? adapter.move(focus, event.key, event.shiftKey, control)
      : gridKeyboardTarget(
          focus,
          event.key,
          event.shiftKey,
          control,
          bounds,
          adapter.pageRows?.() ?? 10,
        );
    if (!target) return;
    event.preventDefault();
    this.select(target, event.key !== 'Tab' && event.shiftKey);
  };
  /** 更新提示语言，不重置选区或正在阅读的位置。 */
  updateLocale(locale?: 'zh-CN' | 'en-US'): void {
    this.options.locale = locale;
  }
  setActive(active: boolean): void {
    if (this.closed || this.active === active) return;
    this.active = active;
    this.textSelection.setActive(active);
    this.layer.hidden = !active || this.textSelection.active;
    if (active) {
      this.pointer = new GridPointer(
        this.options.host,
        (x, y, clamp) => this.options.adapter.hitTest(x, y, clamp),
        (point, extend, nativeText) =>
          nativeText
            ? this.applySelection(point, extend, false)
            : this.select(point, extend, false),
        this.textSelection,
      );
      this.refresh();
    } else {
      this.copying.abort();
      this.pointer?.dispose();
      this.pointer = undefined;
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.setActive(false);
    this.closed = true;
    this.textSelection.dispose();
    this.options.host.removeEventListener('keydown', this.key);
    this.options.host.removeEventListener('scroll', this.refresh);
    this.options.host.removeAttribute('aria-activedescendant');
    this.layer.remove();
    this.releaseStyles();
    if (
      this.positionedParent &&
      !this.overlayParent?.querySelector('.filumo-grid-selection-layer')
    )
      this.overlayParent?.classList.remove('filumo-grid-overlay-host');
  }
}
