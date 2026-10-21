import type { StylePolicy } from '@filumo/dom';
import type {
  PdfBackend,
  PdfOutlineEntry,
  PdfReadingPosition,
} from '../runtime/contracts';
import { PdfOutline, type PdfOutlineNavigate } from './PdfOutline';
import { PdfSearch } from './PdfSearch';
import { PdfSearchPanel } from './PdfSearchPanel';
import { PdfThumbnails } from './PdfThumbnails';
import type { PdfViewport } from './PdfViewport';
import { pdfIcon } from './pdfUi';

export type PdfSidebarMode = 'outline' | 'thumbnails' | 'search';
const MODES: readonly PdfSidebarMode[] = ['outline', 'thumbnails', 'search'];
let sequence = 0;

/** 单个导航面板持有三个 Tab；切换只改变激活状态，不重建 PDF 阅读区。 */
export class PdfSidebar {
  readonly element: HTMLElement;
  private content: HTMLElement;
  private tabs = new Map<PdfSidebarMode, HTMLButtonElement>();
  private panels = new Map<PdfSidebarMode, HTMLElement>();
  private count: HTMLElement;
  private collapseButton: HTMLButtonElement;
  private expandButton: HTMLButtonElement;
  private outline: HTMLElement;
  private outlineStatus: HTMLElement;
  private thumbnails: PdfThumbnails;
  private searchPanel: PdfSearchPanel;
  private outlineTree: PdfOutline;
  private entries: readonly PdfOutlineEntry[] = [];
  private mode: PdfSidebarMode = 'outline';
  private open = true;
  private active = true;
  private closed = false;
  private interacted = false;
  private loading = true;
  private outlineError?: string;
  private controller = new AbortController();
  constructor(
    document: Document,
    private backend: PdfBackend,
    viewport: PdfViewport,
    private search: PdfSearch,
    navigate: PdfOutlineNavigate,
    private change: () => void,
    private locale?: 'zh-CN' | 'en-US',
    stylePolicy?: StylePolicy,
    onError?: (error: unknown) => void,
  ) {
    const id = 'filumo-pdf-navigation-' + ++sequence;
    this.element = document.createElement('nav');
    this.element.className = 'filumo-pdf-sidebar';
    this.expandButton = document.createElement('button');
    this.expandButton.type = 'button';
    this.expandButton.className = 'filumo-pdf-sidebar-expand';
    this.expandButton.append(pdfIcon(document, 'expand'));
    this.expandButton.onclick = () => {
      this.interacted = true;
      this.open = true;
      this.sync();
      this.change();
      this.tabs.get(this.mode)?.focus();
    };
    this.content = document.createElement('div');
    this.content.className = 'filumo-pdf-sidebar-content';
    const header = document.createElement('header'),
      tabs = document.createElement('div');
    tabs.className = 'filumo-pdf-tabs';
    tabs.setAttribute('role', 'tablist');
    for (const mode of MODES) {
      const button = document.createElement('button'),
        panel = document.createElement('div');
      button.type = 'button';
      button.className = 'filumo-pdf-tab';
      button.id = id + '-tab-' + mode;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', id + '-panel-' + mode);
      panel.id = id + '-panel-' + mode;
      panel.className = 'filumo-pdf-tab-panel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      button.onclick = () => this.select(mode, mode === 'search');
      this.tabs.set(mode, button);
      this.panels.set(mode, panel);
      tabs.append(button);
    }
    tabs.onkeydown = (event) => {
      const current = MODES.indexOf(this.mode);
      let index: number;
      if (event.key === 'ArrowRight') index = (current + 1) % MODES.length;
      else if (event.key === 'ArrowLeft')
        index = (current + MODES.length - 1) % MODES.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = MODES.length - 1;
      else return;
      event.preventDefault();
      this.select(MODES[index], false);
      this.tabs.get(MODES[index])?.focus();
    };
    this.count = document.createElement('span');
    this.count.className = 'filumo-pdf-sidebar-count';
    this.collapseButton = document.createElement('button');
    this.collapseButton.type = 'button';
    this.collapseButton.className = 'filumo-pdf-sidebar-collapse';
    this.collapseButton.append(pdfIcon(document, 'collapse'));
    this.collapseButton.onclick = () => this.collapse(true);
    header.append(tabs, this.count, this.collapseButton);
    this.outline = document.createElement('div');
    this.outline.className = 'filumo-pdf-outline';
    this.outlineStatus = document.createElement('div');
    this.outlineStatus.className = 'filumo-pdf-outline-status';
    this.outlineStatus.setAttribute('role', 'status');
    this.outlineTree = new PdfOutline(document, navigate, locale, stylePolicy, {
      backend,
      onError,
    });
    this.outline.append(this.outlineStatus, this.outlineTree.element);
    this.thumbnails = new PdfThumbnails(
      document,
      viewport,
      backend.pageCount,
      (index) => {
        void Promise.resolve()
          .then(() => navigate(index))
          .catch((error) => {
            if ((error as { name?: string })?.name !== 'AbortError')
              onError?.(error);
          });
      },
    );
    this.searchPanel = new PdfSearchPanel(
      document,
      search,
      () => this.collapse(true),
      locale,
    );
    this.panels.get('outline')!.append(this.outline);
    this.panels.get('thumbnails')!.append(this.thumbnails.element);
    this.panels.get('search')!.append(this.searchPanel.element);
    this.content.append(header, ...this.panels.values());
    this.element.append(this.expandButton, this.content);
    this.update(locale);
    this.sync();
    void backend
      .readOutline(this.controller.signal)
      .then((entries) => {
        if (this.closed) return;
        this.loading = false;
        this.entries = entries;
        this.outlineTree.setEntries(entries);
        // 只在用户尚未操作时选择首次默认页，异步加载不能抢走正在使用的 Tab。
        if (!entries.length && !this.interacted) this.mode = 'thumbnails';
        this.sync();
        this.change();
      })
      .catch((error) => {
        if (this.closed) return;
        this.loading = false;
        this.outlineError = String(error);
        if (!this.interacted) this.mode = 'thumbnails';
        this.sync();
        this.change();
      });
  }
  private renderOutline() {
    if (this.closed) return;
    const en = this.locale === 'en-US';
    this.outlineStatus.textContent = this.outlineError
      ? (en ? 'Outline unavailable: ' : '大纲读取失败：') + this.outlineError
      : this.loading
      ? en
        ? 'Loading outline…'
        : '正在读取大纲…'
      : !this.entries.length
      ? en
        ? 'No outline'
        : '暂无大纲'
      : '';
  }
  private updateCount() {
    this.count.hidden = this.mode === 'search';
    this.count.textContent = String(
      this.mode === 'thumbnails'
        ? this.backend.pageCount
        : this.outlineTree.getCount(),
    );
  }
  private sync() {
    this.element.dataset.mode = this.mode;
    this.element.dataset.collapsed = String(!this.open);
    this.content.hidden = !this.open;
    this.expandButton.hidden = this.open;
    this.expandButton.setAttribute('aria-expanded', String(this.open));
    for (const [mode, button] of this.tabs) {
      button.classList.toggle('filumo-pdf-tab--active', mode === this.mode);
      button.setAttribute('aria-selected', String(mode === this.mode));
      button.tabIndex = mode === this.mode ? 0 : -1;
      this.panels.get(mode)!.hidden = mode !== this.mode;
    }
    const searching = this.active && this.open && this.mode === 'search';
    this.searchPanel.setActive(searching);
    this.search.setActive(searching);
    this.thumbnails.setActive(
      this.active && this.open && this.mode === 'thumbnails',
    );
    this.outlineTree.setActive(
      this.active && this.open && this.mode === 'outline',
    );
    this.updateCount();
    this.renderOutline();
  }
  getState() {
    return {
      available: this.entries.length > 0,
      open: this.open,
      mode: this.mode,
    };
  }
  /** Tab 选择始终展开内容，重复点击当前 Tab 不执行折叠。 */
  select(mode: PdfSidebarMode, focusSearch = false): void {
    if (this.closed) return;
    this.interacted = true;
    this.open = true;
    this.mode = mode;
    this.sync();
    this.change();
    if (mode === 'search' && focusSearch && this.active)
      this.searchPanel.focus();
  }
  /** 保留原能力调用的切换语义；查找入口只打开并聚焦，不关闭查询。 */
  show(mode: PdfSidebarMode): void {
    if (mode === 'search') {
      this.select(mode, true);
      return;
    }
    if (this.open && this.mode === mode) this.collapse();
    else this.select(mode);
  }
  collapse(focus = false): void {
    if (this.closed) return;
    this.interacted = true;
    this.open = false;
    this.sync();
    this.change();
    if (focus) this.expandButton.focus({ preventScroll: true });
  }
  updateCurrent(index: number): void {
    this.thumbnails.updateCurrent(index);
  }
  /** 正文位置独立于工具栏页码更新，保留同页书签定位精度。 */
  updateReadingPosition(position: PdfReadingPosition): void {
    this.outlineTree.setReadingPosition(position);
  }
  update(locale?: 'zh-CN' | 'en-US'): void {
    this.locale = locale;
    const en = locale === 'en-US',
      labels = {
        outline: en ? 'Outline' : '大纲',
        thumbnails: en ? 'Thumbnails' : '缩略图',
        search: en ? 'Find' : '查找',
      };
    this.element.setAttribute('aria-label', en ? 'PDF navigation' : 'PDF 导航');
    for (const [mode, button] of this.tabs) button.textContent = labels[mode];
    for (const [button, label] of [
      [this.collapseButton, en ? 'Collapse navigation' : '收起导航'],
      [this.expandButton, en ? 'Expand navigation' : '展开导航'],
    ] as const) {
      button.title = label;
      button.setAttribute('aria-label', label);
    }
    this.outlineTree.setLocale(locale);
    this.searchPanel.update(locale);
    this.thumbnails.update(locale);
    this.updateCount();
    this.renderOutline();
  }
  setActive(value: boolean): void {
    if (this.closed) return;
    this.active = value;
    this.sync();
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.controller.abort();
    this.outlineTree.dispose();
    this.searchPanel.dispose();
    this.search.setActive(false);
    this.thumbnails.dispose();
    this.element.remove();
  }
}
