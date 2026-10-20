import { SplitHandle } from '@fivo/dom/split';
import type { ViewContext, ViewOptions } from '@fivo/dom';
import type { TextDecoration, TextSurfaceHandle } from '@fivo/dom/text';
import type { XmlSession } from '../runtime/XmlSession';
import type { XmlDocument, XmlParseResult } from '../parser/types';
import type { XmlTree } from './XmlTree';
import type { xmlLineDecorations } from './xmlTokens';
import './workspace.less';
interface Pane {
  element: HTMLElement;
  body: HTMLElement;
  label: HTMLElement;
  toggle: HTMLButtonElement;
}

/** 原文、结构和装饰各自懒加载，结构失败只回退该区域。 */
export class XmlWorkspace {
  readonly element: HTMLElement;
  private sourcePane: Pane;
  private treePane: Pane;
  private status: HTMLElement;
  private split: SplitHandle;
  private source?: TextSurfaceHandle;
  private tree?: XmlTree;
  private model?: XmlDocument;
  private decorations: readonly TextDecoration[] = [];
  private decorate?: typeof xmlLineDecorations;
  private enhancing?: AbortController;
  private pendingRange?: { start: number; end: number };
  private generation = 0;
  private active = true;
  private closed = false;
  private observer?: ResizeObserver;
  private options: ViewOptions;
  private zoom: number;
  private narrow = false;
  constructor(
    private host: HTMLElement,
    private session: XmlSession,
    private context: ViewContext,
    private change: () => void,
  ) {
    const document = host.ownerDocument;
    this.options = context.options;
    this.zoom = context.options.zoom ?? 100;
    this.element = document.createElement('section');
    this.element.className = 'fivo-xml-workspace';
    const pane = (kind: string): Pane => {
      const element = document.createElement('section'),
        header = document.createElement('header'),
        label = document.createElement('span'),
        toggle = document.createElement('button'),
        body = document.createElement('div');
      element.className = 'fivo-xml-pane fivo-xml-pane-' + kind;
      body.className = 'fivo-xml-pane-body';
      toggle.type = 'button';
      header.append(label, toggle);
      element.append(header, body);
      return { element, label, toggle, body };
    };
    this.sourcePane = pane('source');
    this.treePane = pane('tree');
    this.status = document.createElement('div');
    this.status.className = 'fivo-xml-status';
    this.status.setAttribute('role', 'status');
    this.treePane.body.append(this.status);
    this.split = new SplitHandle(this.element, {
      first: this.sourcePane.element,
      minFirst: 280,
      minSecond: 240,
      onResize: (_first, second) =>
        this.element.style.setProperty('--fivo-xml-tree-width', second + 'px'),
      stylePolicy: context.stylePolicy,
    });
    this.element.append(
      this.sourcePane.element,
      this.split.element,
      this.treePane.element,
    );
    host.append(this.element);
    this.sourcePane.toggle.onclick = () => this.setMode('tree');
    this.treePane.toggle.onclick = () => this.setMode('source');
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      this.observer = new Resize(() => this.run());
      this.observer.observe(host);
    }
  }
  private get en() {
    return this.options.locale === 'en-US';
  }
  private get sourceWanted() {
    return this.session.mode === 'source' || !this.narrow;
  }
  private sourceOptions() {
    return {
      ...this.options,
      zoom: this.zoom,
      // 原文和工具栏读取同一份会话状态，缩放及视图切换不会恢复默认值。
      lineNumbers: this.session.lineNumbers,
      wrap: true,
      watermark: undefined,
      maxMatches: 10000,
      stylePolicy: this.context.stylePolicy,
      decorateLine: (start: number, end: number) =>
        this.decorate?.(this.decorations, start, end) ?? [],
      onMatch: (range: { start: number; end: number }) =>
        this.match(range.start),
    };
  }
  private layout() {
    this.narrow = (this.host.clientWidth || 800) < 720;
    this.element.dataset.layout =
      this.session.mode === 'tree' && !this.narrow
        ? 'split'
        : this.session.mode;
    this.sourcePane.element.hidden = !this.sourceWanted;
    this.treePane.element.hidden = this.session.mode !== 'tree';
    this.sourcePane.label.textContent = this.en ? 'Source' : '原文';
    this.treePane.label.textContent =
      (this.en ? 'Structure' : '结构') +
      (this.model ? `（${this.model.nodes.length - 1}）` : '');
    this.sourcePane.toggle.textContent = this.en
      ? 'Show structure'
      : '显示结构';
    this.sourcePane.toggle.hidden = this.session.mode === 'tree';
    this.treePane.toggle.textContent = this.en ? 'Hide structure' : '隐藏结构';
    this.split.update(
      this.host.clientWidth || 800,
      this.session.mode === 'tree' && !this.narrow,
      this.options.locale,
    );
    this.split.setActive(this.active);
    this.source?.setActive(this.active && this.sourceWanted);
    this.tree?.setActive(this.active && this.session.mode === 'tree');
  }
  private valid(version: number) {
    return !this.closed && this.active && version === this.generation;
  }
  private async mountSource(version: number) {
    if (!this.source) {
      const module = await import('@fivo/dom/text');
      if (!this.valid(version)) return;
      this.source = module.mountTextSurface(
        this.sourcePane.body,
        this.session.content.document!,
        this.sourceOptions(),
      );
    }
    this.source.update(this.session.content.document!, this.sourceOptions());
    if (!this.enhancing && !this.decorate) {
      const own = (this.enhancing = new AbortController());
      void import('./xmlTokens')
        .then(async (module) => ({
          module,
          ranges: await module.indexXmlTokens(
            this.session.content.document!.text,
            own.signal,
          ),
        }))
        .then(({ module, ranges }) => {
          if (!own.signal.aborted && !this.closed) {
            this.decorate = module.xmlLineDecorations;
            this.decorations = ranges;
            this.source?.update(
              this.session.content.document!,
              this.sourceOptions(),
            );
          }
        })
        .catch(() => {
          if (!own.signal.aborted && !this.closed) {
            this.decorations = [];
            this.decorate = () => [];
            this.source?.update(
              this.session.content.document!,
              this.sourceOptions(),
            );
          }
        })
        .finally(() => {
          if (this.enhancing === own) {
            this.enhancing = undefined;
            if (
              own.signal.aborted &&
              this.active &&
              !this.closed &&
              this.sourceWanted
            )
              this.run();
          }
        });
    }
    if (this.pendingRange) {
      this.source.revealRange?.(this.pendingRange);
      this.pendingRange = undefined;
    }
  }
  private async reconcile() {
    const version = ++this.generation;
    this.layout();
    if (this.sourceWanted) {
      await this.mountSource(version);
      if (!this.valid(version)) return;
    }
    if (this.session.mode !== 'tree') {
      this.session.pause();
      this.change();
      return;
    }
    if (!this.tree) {
      this.status.textContent = this.en
        ? 'Reading XML structure…'
        : '正在读取 XML 结构…';
      let result: XmlParseResult;
      try {
        result = await this.session.ensureParsed();
      } catch (reason) {
        if ((reason as { name?: string })?.name === 'AbortError') throw reason;
        result = {
          kind: 'invalid',
          diagnostics: [
            {
              message:
                reason instanceof Error ? reason.message : String(reason),
              offset: 0,
              line: 1,
              column: 1,
            },
          ],
        };
      }
      if (!this.valid(version)) return;
      if (result.kind !== 'ready') {
        const error = result.diagnostics[0];
        this.status.textContent =
          error.message +
          (this.en
            ? ` (line ${error.line}, column ${error.column})`
            : `（第 ${error.line} 行，第 ${error.column} 列）`);
        this.session.mode = 'source';
        this.context.onError(new Error(this.status.textContent));
        this.pendingRange = {
          start: error.offset,
          end: Math.min(
            this.session.content.document!.text.length,
            error.offset + 1,
          ),
        };
        this.layout();
        await this.mountSource(version);
        this.change();
        return;
      }
      const module = await import('./XmlTree');
      if (!this.valid(version)) return;
      this.model = result.document;
      this.tree = new module.XmlTree(
        result.document,
        this.host.ownerDocument,
        (range) => {
          this.pendingRange = range;
          if (this.narrow) this.session.mode = 'source';
          this.run();
        },
        this.change,
        this.options.locale,
        this.context.stylePolicy,
      );
      this.treePane.body.append(this.tree.element);
      this.status.textContent = '';
    }
    this.tree.update(this.session.whitespace, this.options.locale, this.zoom);
    this.layout();
    this.change();
  }
  private match(offset: number) {
    if (!this.model || !this.tree) return;
    const nodes = this.model.nodes;
    let low = 0,
      high = nodes.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (nodes[mid].start <= offset) low = mid + 1;
      else high = mid;
    }
    let node = nodes[Math.max(0, low - 1)];
    while (node.parentId && node.end <= offset)
      node = nodes[Number(node.parentId)];
    this.tree.revealNode(node.id);
  }
  private run() {
    if (!this.closed && this.active)
      void this.reconcile().catch((error) => {
        if (!this.closed && (error as { name?: string })?.name !== 'AbortError')
          this.context.onError(error);
      });
  }
  initialize(): Promise<void> {
    return this.reconcile();
  }
  setMode(mode: 'tree' | 'source'): void {
    this.session.mode = mode;
    this.run();
  }
  getState() {
    return {
      mode: this.session.mode,
      narrow: this.narrow,
      treeReady: !!this.tree && this.session.mode === 'tree',
      sourceReady: !!this.source && this.sourceWanted,
    };
  }
  getBranchState() {
    return this.tree?.getBranchState();
  }
  toggleBranch(): void {
    this.tree?.toggleBranch();
  }
  showSearch(): void {
    if (!this.sourceWanted) this.session.mode = 'source';
    void this.reconcile()
      .then(() => {
        if (!this.closed && this.active) this.source?.showSearch(true);
      })
      .catch(this.context.onError);
  }
  update(options: ViewOptions, zoom: number): void {
    this.options = options;
    this.zoom = zoom;
    this.run();
  }
  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.generation++;
      this.session.pause();
      this.enhancing?.abort();
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
    this.generation++;
    this.session.pause();
    this.enhancing?.abort();
    this.observer?.disconnect();
    this.source?.dispose();
    this.tree?.dispose();
    this.split.dispose();
    this.decorations = [];
    this.model = undefined;
    this.element.remove();
  }
}
