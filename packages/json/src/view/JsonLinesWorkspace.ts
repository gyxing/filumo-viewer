import { indexLines } from '@fivo/core/text';
import type { TextDocument } from '@fivo/core/text';
import type { ViewContext, ViewOptions } from '@fivo/dom';
import type { JsonLinesSession } from '../runtime/JsonLinesSession';
import type { JsonLinesIndex } from '../parser/linesTypes';
import type { JsonLinesResult } from '../parser/linesTypes';
import type { JsonParseResult } from '../parser/types';
import type { JsonTree } from './JsonTree';
import type { JsonSource } from './JsonSource';
import { JsonRecordList } from './JsonRecordList';
import './lines.less';

/** 记录列表与详情不构建整文件巨树，局部节点仅在整文件定位时转换偏移。 */
export class JsonLinesWorkspace {
  readonly element: HTMLElement;
  private listHost: HTMLElement;
  private detailHost: HTMLElement;
  private recordBody: HTMLElement;
  private tabs: HTMLElement;
  private fullHost: HTMLElement;
  private status: HTMLElement;
  private layoutTabs: HTMLElement;
  private list?: JsonRecordList;
  private index?: JsonLinesIndex;
  private tree?: JsonTree;
  private source?: JsonSource;
  private full?: JsonSource;
  private local?: TextDocument;
  private selected = -1;
  private recordMode: 'tree' | 'source' = 'tree';
  private narrowPanel: 'list' | 'detail' = 'list';
  private narrow = false;
  private observer?: ResizeObserver;
  private controller = new AbortController();
  private generation = 0;
  private active = true;
  private closed = false;
  private treeStates = new Map<number, ReturnType<JsonTree['getState']>>();
  private localRange?: { start: number; end: number };
  private globalRange?: { start: number; end: number };
  private options: ViewOptions;
  private zoom: number;
  constructor(
    private host: HTMLElement,
    private session: JsonLinesSession,
    private context: ViewContext,
    private change: () => void,
  ) {
    const document = host.ownerDocument;
    this.options = context.options;
    this.zoom = context.options.zoom ?? 100;
    this.element = document.createElement('section');
    this.element.className = 'fivo-json-lines-workspace';
    this.layoutTabs = document.createElement('div');
    this.layoutTabs.className = 'fivo-json-lines-layout-tabs';
    this.listHost = document.createElement('aside');
    this.listHost.className = 'fivo-json-lines-list';
    this.detailHost = document.createElement('section');
    this.detailHost.className = 'fivo-json-lines-detail';
    this.tabs = document.createElement('div');
    this.tabs.className = 'fivo-json-record-tabs';
    this.tabs.setAttribute('role', 'tablist');
    this.recordBody = document.createElement('div');
    this.recordBody.className = 'fivo-json-record-body';
    this.status = document.createElement('div');
    this.status.className = 'fivo-json-lines-status';
    this.status.setAttribute('role', 'status');
    this.fullHost = document.createElement('div');
    this.fullHost.className = 'fivo-json-lines-full';
    const panes = document.createElement('div');
    panes.className = 'fivo-json-lines-panes';
    this.detailHost.append(this.tabs, this.status, this.recordBody);
    panes.append(this.listHost, this.detailHost);
    this.element.append(this.layoutTabs, panes, this.fullHost);
    host.append(this.element);
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      this.observer = new Resize(() => {
        this.layout();
        this.change();
      });
      this.observer.observe(host);
    }
    this.layout();
  }
  private get en() {
    return this.options.locale === 'en-US';
  }
  private button(
    host: HTMLElement,
    label: string,
    run: () => void,
    selected?: boolean,
  ) {
    const node = host.ownerDocument.createElement('button');
    node.type = 'button';
    node.textContent = label;
    node.onclick = run;
    if (selected !== undefined) {
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-selected', String(selected));
    }
    host.append(node);
    return node;
  }
  private layout() {
    this.narrow = (this.host.clientWidth || 800) < 720;
    this.element.dataset.mode = this.session.mode;
    this.element.dataset.narrow = String(this.narrow);
    this.element.dataset.panel = this.narrowPanel;
    this.fullHost.hidden = this.session.mode !== 'source';
    this.listHost.hidden =
      this.session.mode === 'source' ||
      (this.narrow && this.narrowPanel !== 'list');
    this.detailHost.hidden =
      this.session.mode === 'source' ||
      (this.narrow && this.narrowPanel !== 'detail');
    this.layoutTabs.hidden = !this.narrow || this.session.mode === 'source';
    this.layoutTabs.replaceChildren();
    this.button(
      this.layoutTabs,
      this.en ? 'Records' : '记录',
      () => {
        this.narrowPanel = 'list';
        this.layout();
        this.change();
      },
      this.narrowPanel === 'list',
    );
    this.button(
      this.layoutTabs,
      this.en ? 'Details' : '详情',
      () => {
        this.narrowPanel = 'detail';
        this.run();
      },
      this.narrowPanel === 'detail',
    );
    this.list?.setActive(this.active && !this.listHost.hidden);
    this.tree?.setActive(
      this.active && !this.detailHost.hidden && this.recordMode === 'tree',
    );
    this.source?.setActive(
      this.active && !this.detailHost.hidden && this.recordMode === 'source',
    );
    this.full?.setActive(this.active && !this.fullHost.hidden);
  }
  private valid(version: number) {
    return !this.closed && this.active && version === this.generation;
  }
  private run() {
    if (this.closed || !this.active) return;
    void this.reconcile().catch((error) => {
      if (!this.closed && (error as { name?: string })?.name !== 'AbortError') {
        this.status.textContent =
          error instanceof Error ? error.message : String(error);
        this.change();
      }
    });
  }
  private select = (index: number) => {
    this.session.setCurrent(index);
    this.list?.setCurrent(index);
    this.narrowPanel = 'detail';
    this.run();
  };
  private keepRecordState() {
    if (this.tree && this.selected >= 0) {
      this.treeStates.delete(this.selected);
      this.treeStates.set(this.selected, this.tree.getState());
      while (this.treeStates.size > 3)
        this.treeStates.delete(this.treeStates.keys().next().value as number);
    }
  }
  private async showFull(version: number) {
    if (!this.full) {
      const module = await import('./JsonSource');
      if (!this.valid(version)) return;
      this.full = new module.JsonSource(
        this.fullHost,
        this.session.content.document!,
        this.options,
        this.zoom,
        this.context.stylePolicy,
        'json',
        (range) => {
          const revision = this.session.content.revision;
          void this.session
            .ensureIndex()
            .then((result) => {
              if (
                this.closed ||
                revision !== this.session.content.revision ||
                result.kind !== 'ready'
              )
                return;
              const starts = result.index.starts;
              let low = 0,
                high = starts.length;
              while (low < high) {
                const mid = (low + high) >>> 1;
                if (starts[mid] <= range.start) low = mid + 1;
                else high = mid;
              }
              this.session.setCurrent(Math.max(0, low - 1));
              this.list?.setCurrent(this.session.getCurrent());
            })
            .catch(() => undefined);
        },
        () => this.session.lineNumbers,
      );
    }
    this.full.update(this.options, this.zoom);
    this.layout();
    if (this.globalRange) {
      this.full.revealRange(this.globalRange);
      this.globalRange = undefined;
    }
  }
  private async reconcile() {
    const version = ++this.generation;
    if (this.session.mode === 'source') {
      this.layout();
      await this.showFull(version);
      this.change();
      return;
    }
    if (!this.index) {
      this.status.textContent = this.en
        ? 'Indexing records…'
        : '正在建立记录索引…';
      let result: JsonLinesResult;
      try {
        result = await this.session.ensureIndex();
      } catch (reason) {
        if ((reason as { name?: string })?.name === 'AbortError') throw reason;
        result = {
          kind: 'limited',
          message: reason instanceof Error ? reason.message : String(reason),
          offset: 0,
        };
      }
      if (!this.valid(version)) return;
      if (result.kind !== 'ready') {
        this.status.textContent = result.message;
        this.context.onError(new Error(result.message));
        this.session.mode = 'source';
        await this.showFull(version);
        this.change();
        return;
      }
      this.index = result.index;
      this.list = new JsonRecordList(
        this.host.ownerDocument,
        this.session.content.document!.text,
        this.index,
        this.en,
        this.select,
      );
      this.listHost.append(this.list.element);
    }
    if (!this.index.starts.length) {
      this.status.textContent = this.en ? 'No records' : '暂无记录';
      this.layout();
      this.change();
      return;
    }
    const current = Math.max(
      0,
      Math.min(this.index.starts.length - 1, this.session.getCurrent()),
    );
    this.session.setCurrent(current);
    this.list!.setCurrent(current);
    this.layout();
    if (this.narrow && this.narrowPanel === 'list') {
      this.change();
      return;
    }
    if (this.selected !== current) {
      this.keepRecordState();
      this.tree?.dispose();
      this.source?.dispose();
      this.tree = undefined;
      this.source = undefined;
      this.recordBody.replaceChildren();
      this.selected = current;
      this.localRange = undefined;
      this.local = undefined;
    }
    if (!this.local) {
      const text = this.session.content.document!.text.slice(
        this.index.starts[current],
        this.index.ends[current],
      );
      const indexed = await indexLines(text, this.controller.signal);
      if (!this.valid(version)) return;
      this.local = {
        text,
        encoding: this.session.content.document!.encoding,
        ...indexed,
      };
    }
    if (this.recordMode === 'tree' && !this.tree) {
      let result: JsonParseResult;
      try {
        result = await this.session.ensureRecord(current);
      } catch (reason) {
        if ((reason as { name?: string })?.name === 'AbortError') throw reason;
        result = {
          kind: 'invalid',
          text: this.local.text,
          diagnostics: [
            {
              message:
                reason instanceof Error ? reason.message : String(reason),
              offset: 0,
              line: 1,
              column: 1,
              severity: 'error',
            },
          ],
        };
      }
      if (!this.valid(version)) return;
      if (result.kind === 'ready') {
        const module = await import('./JsonTree');
        if (!this.valid(version)) return;
        this.tree = new module.JsonTree(
          result.document,
          this.local,
          this.host.ownerDocument,
          this.session.options.initialExpandDepth ?? 2,
          this.zoom,
          this.en,
          this.change,
          (range) => {
            this.localRange = range;
            this.recordMode = 'source';
            this.run();
          },
        );
        const saved = this.treeStates.get(current);
        if (saved) this.tree.restoreState(saved);
        this.recordBody.append(this.tree.element);
        this.status.textContent = '';
      } else {
        this.recordMode = 'source';
        const last = result.diagnostics.at(-1);
        this.status.textContent =
          (last?.message ?? 'JSON 记录无效') +
          (this.en
            ? ` · file line ${this.index.lineNumbers[current]}`
            : ` · 源文件第 ${this.index.lineNumbers[current]} 行`);
      }
    }
    if (this.recordMode === 'source' && !this.source) {
      const module = await import('./JsonSource');
      if (!this.valid(version)) return;
      this.source = new module.JsonSource(
        this.recordBody,
        this.local,
        this.options,
        this.zoom,
        this.context.stylePolicy,
        'json',
        (range) => {
          this.localRange = range;
        },
        () => this.session.lineNumbers,
      );
    }
    if (this.tree) this.tree.element.hidden = this.recordMode !== 'tree';
    this.recordBody.dataset.mode = this.recordMode;
    // Source 自己持有根节点，借助单独类包裹选择隐藏而不销毁查找状态。
    const surface =
      this.recordBody.querySelector<HTMLElement>('.fivo-text-scope');
    if (surface) surface.hidden = this.recordMode !== 'source';
    this.tabs.replaceChildren();
    this.button(
      this.tabs,
      this.en ? 'Structure' : '结构',
      () => {
        this.recordMode = 'tree';
        this.run();
      },
      this.recordMode === 'tree',
    );
    this.button(
      this.tabs,
      this.en ? 'Source' : '原文',
      () => {
        this.recordMode = 'source';
        this.run();
      },
      this.recordMode === 'source',
    );
    this.button(
      this.tabs,
      this.en ? 'Locate in file' : '在整文件原文定位',
      () => {
        const range = this.localRange ?? {
          start: 0,
          end: this.local!.text.length,
        };
        this.globalRange = {
          start: this.index!.starts[this.selected] + range.start,
          end: this.index!.starts[this.selected] + range.end,
        };
        this.setMode('source');
      },
    );
    this.source?.update(this.options, this.zoom);
    this.tree?.setZoom(this.zoom);
    this.list?.update(this.zoom, this.en);
    this.layout();
    if (this.recordMode === 'source' && this.localRange)
      this.source?.revealRange(this.localRange);
    this.change();
  }
  initialize(): Promise<void> {
    return this.reconcile();
  }
  setMode(mode: 'tree' | 'source'): void {
    if (mode === 'source') {
      this.session.pause();
      this.controller.abort();
      this.controller = new AbortController();
    }
    this.session.mode = mode;
    this.run();
  }
  getState() {
    return {
      mode: this.session.mode,
      narrow: this.narrow,
      treeReady:
        !!this.tree &&
        !this.detailHost.hidden &&
        this.recordMode === 'tree' &&
        this.session.mode === 'tree',
      sourceReady:
        this.session.mode === 'source'
          ? !!this.full
          : !!this.source && !this.detailHost.hidden,
      treeVisible:
        this.session.mode === 'tree' &&
        !this.detailHost.hidden &&
        this.recordMode === 'tree',
    };
  }
  getBranchState() {
    return this.getState().treeReady ? this.tree?.getBranchState() : undefined;
  }
  toggleBranch(): void {
    this.tree?.toggleSelected();
  }
  getPath(): string {
    return '/' + this.session.getCurrent() + (this.tree?.getPath() ?? '');
  }
  showSearch(): void {
    if (this.session.mode === 'source') {
      this.full?.showSearch();
      return;
    }
    this.narrowPanel = 'detail';
    void this.reconcile()
      .then(() => {
        if (!this.closed && this.active) {
          if (this.recordMode === 'source') this.source?.showSearch();
          else this.tree?.showSearch();
        }
      })
      .catch(() => undefined);
  }
  update(options: ViewOptions, zoom: number): void {
    if (options.locale !== this.options.locale) {
      this.keepRecordState();
      this.tree?.dispose();
      this.tree = undefined;
    }
    this.options = options;
    this.zoom = zoom;
    this.run();
  }
  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.generation++;
      this.session.pause();
      this.controller.abort();
      this.controller = new AbortController();
      this.observer?.disconnect();
    } else {
      this.observer?.observe(this.host);
      this.run();
    }
    this.layout();
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.session.pause();
    this.generation++;
    this.controller.abort();
    this.observer?.disconnect();
    this.list?.dispose();
    this.tree?.dispose();
    this.source?.dispose();
    this.full?.dispose();
    this.treeStates.clear();
    this.local = undefined;
    this.element.remove();
  }
}
