import type { ViewContext, ViewOptions } from '@filumo/dom';
import type { TextSurfacePosition } from '@filumo/dom/text';
import type { JsonDiagnostic } from '../parser/types';
import type { JsonSession } from '../runtime/JsonSession';
import type { JsonSource } from './JsonSource';
import { JsonSplitHandle } from './JsonSplitHandle';
import type { JsonTree } from './JsonTree';
import './workspace.less';

interface Pane {
  element: HTMLElement;
  title: HTMLElement;
  toggle: HTMLButtonElement;
  body: HTMLElement;
}
interface Failure {
  message: string;
  offset?: number;
  line?: number;
  column?: number;
  syntax?: boolean;
}
// 以实际容器宽度控制两栏，隐藏区域不因浏览器窗口足够宽而提前加载。
const SPLIT_WIDTH = 720;

/** JSON 工作区持有可见区域与显示状态，代码区和结构树保持独立动态入口。 */
export class JsonWorkspace {
  readonly element: HTMLElement;
  private sourcePane: Pane;
  private treePane: Pane;
  private split: JsonSplitHandle;
  private notice: HTMLElement;
  private treeStatus: HTMLElement;
  private source?: JsonSource;
  private tree?: JsonTree;
  private treeDiagnostics: readonly JsonDiagnostic[] = [];
  private sourcePosition: TextSurfacePosition = { top: 0, left: 0 };
  private treeState?: ReturnType<JsonTree['getState']>;
  private pendingRange?: { start: number; end: number };
  private failure?: Failure;
  private resize?: ResizeObserver;
  private width = 0;
  private active = true;
  private closed = false;
  private generation = 0;
  private revision: number;
  private focused: 'source' | 'tree' = 'source';
  private options: ViewOptions;
  private zoom: number;
  constructor(
    private host: HTMLElement,
    private session: JsonSession,
    private context: ViewContext,
    private onChange: () => void,
  ) {
    const document = host.ownerDocument;
    this.options = context.options;
    this.zoom = this.options.zoom ?? 100;
    this.revision = session.content.revision;
    this.element = document.createElement('section');
    this.element.className = 'filumo-json-workspace';
    this.notice = document.createElement('div');
    this.notice.className = 'filumo-json-workspace-notice';
    this.notice.hidden = true;
    const panes = document.createElement('div');
    panes.className = 'filumo-json-panes';
    this.sourcePane = this.pane('source', () => this.setMode('tree'));
    this.treePane = this.pane('tree', () => this.setMode('source'));
    this.split = new JsonSplitHandle(
      panes,
      this.sourcePane.element,
      context.stylePolicy,
    );
    this.treeStatus = document.createElement('div');
    this.treeStatus.className = 'filumo-json-tree-status';
    this.treeStatus.setAttribute('role', 'status');
    this.treePane.body.append(this.treeStatus);
    panes.append(
      this.sourcePane.element,
      this.split.element,
      this.treePane.element,
    );
    this.element.append(this.notice, panes);
    host.append(this.element);
    this.sourcePane.element.addEventListener('focusin', this.focusSource);
    this.sourcePane.element.onpointerdown = () => {
      this.focused = 'source';
    };
    this.treePane.element.addEventListener('focusin', this.focusTree);
    this.treePane.element.onpointerdown = () => {
      this.focused = 'tree';
    };
    const Observer = document.defaultView?.ResizeObserver;
    if (Observer) {
      this.resize = new Observer(() => {
        if (this.active && this.measure()) this.run();
      });
      this.resize.observe(host);
    }
    document.defaultView?.addEventListener('resize', this.windowResize);
  }
  private pane(kind: 'source' | 'tree', run: () => void): Pane {
    const document = this.host.ownerDocument,
      element = document.createElement('section');
    element.className = 'filumo-json-pane filumo-json-pane--' + kind;
    element.setAttribute('role', 'region');
    const header = document.createElement('div');
    header.className = 'filumo-json-pane-header';
    const title = document.createElement('span'),
      toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.onclick = run;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute(
      'd',
      kind === 'tree' ? 'm9 6 6 6-6 6M4 4v16' : 'm15 6-6 6 6 6M20 4v16',
    );
    svg.append(path);
    toggle.append(svg);
    const body = document.createElement('div');
    body.className = 'filumo-json-pane-body';
    header.append(title, toggle);
    element.append(header, body);
    return { element, title, toggle, body };
  }
  private windowResize = () => {
    if (this.active && this.measure()) this.run();
  };
  private focusSource = () => {
    this.focused = 'source';
  };
  private focusTree = () => {
    this.focused = 'tree';
  };
  private measure() {
    const previous = this.width;
    const width = this.host.clientWidth;
    if (width > 0) this.width = width;
    this.updateSplit();
    return (
      !!width && (!previous || previous < SPLIT_WIDTH !== width < SPLIT_WIDTH)
    );
  }
  private valid(version: number) {
    return (
      !this.closed &&
      this.active &&
      version === this.generation &&
      !this.context.session.signal.aborted &&
      this.session.content.revision === this.revision
    );
  }
  private get narrow() {
    return this.width < SPLIT_WIDTH;
  }
  private get treeWanted() {
    return this.session.mode === 'tree';
  }
  private get sourceWanted() {
    return !this.treeWanted || !this.narrow || !!this.failure;
  }
  private updateSplit() {
    this.split.update(
      this.width,
      this.active && this.treeWanted && !this.narrow,
      this.options.locale === 'en-US',
    );
  }
  private saveSource() {
    if (!this.source) return;
    this.sourcePosition = this.source.getPosition();
    this.source.dispose();
    this.source = undefined;
  }
  private saveTree() {
    if (!this.tree) return;
    this.treeState = this.tree.getState();
    this.tree.dispose();
    this.tree = undefined;
  }
  private describe(failure: Failure) {
    const en = this.options.locale === 'en-US';
    return (
      (failure.syntax
        ? en
          ? 'Invalid JSON: '
          : 'JSON 语法错误：'
        : en
        ? 'JSON structure unavailable: '
        : 'JSON 结构不可用：') +
      failure.message +
      (failure.line ? ` (${failure.line}:${failure.column})` : '')
    );
  }
  private diagnostic(host: HTMLElement) {
    host.replaceChildren();
    if (!this.failure) return;
    const document = this.host.ownerDocument,
      label = document.createElement('span');
    label.textContent = this.describe(this.failure);
    host.append(label);
    host.setAttribute('role', 'alert');
    if (this.failure.offset !== undefined) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent =
        this.options.locale === 'en-US' ? 'Locate source' : '定位原文';
      button.onclick = () => {
        const start = this.failure!.offset!;
        this.reveal({ start, end: start + 1 });
        if (!this.sourceWanted) this.setMode('source');
      };
      host.append(button);
    }
  }
  private updateTreeTitle() {
    const en = this.options.locale === 'en-US';
    const count = this.treeDiagnostics.length;
    // 提示随结构标题显示，详细诊断保留在悬停文本中，不额外占用内容区域。
    this.treePane.title.textContent = count
      ? en
        ? `Structure (${count} duplicate ${
            count === 1 ? 'key' : 'keys'
          } preserved)`
        : `结构（已保留 ${count} 个重复属性）`
      : en
      ? 'Structure'
      : '结构';
    this.treePane.title.title = count
      ? (en ? 'Duplicate keys preserved: ' : '已保留重复属性：') +
        count +
        '\n' +
        this.treeDiagnostics
          .slice(0, 10)
          .map((item) => item.message)
          .join('\n')
      : '';
  }
  private layout() {
    const en = this.options.locale === 'en-US';
    this.element.dataset.layout = this.narrow ? 'single' : 'split';
    this.sourcePane.element.hidden = !this.sourceWanted;
    this.treePane.element.hidden =
      !this.treeWanted || (this.narrow && !!this.failure);
    this.updateSplit();
    this.sourcePane.title.textContent = en ? 'Source' : '原文';
    this.updateTreeTitle();
    this.sourcePane.element.setAttribute(
      'aria-label',
      en ? 'JSON source' : 'JSON 原文',
    );
    this.treePane.element.setAttribute(
      'aria-label',
      en ? 'JSON structure' : 'JSON 结构',
    );
    const sourceLabel = en ? 'Show structure' : '显示结构',
      treeLabel = en ? 'Hide structure' : '收起结构';
    this.sourcePane.toggle.hidden = this.treeWanted;
    this.sourcePane.toggle.setAttribute('aria-label', sourceLabel);
    this.sourcePane.toggle.title = sourceLabel;
    this.treePane.toggle.setAttribute('aria-label', treeLabel);
    this.treePane.toggle.title = treeLabel;
    this.notice.hidden = !this.failure || (this.treeWanted && !this.narrow);
    if (!this.notice.hidden) this.diagnostic(this.notice);
    if (this.failure && !this.treePane.element.hidden) {
      this.treeStatus.hidden = false;
      this.diagnostic(this.treeStatus);
    }
  }
  private reveal = (range: { start: number; end: number }) => {
    if (!this.valid(this.generation)) return;
    this.pendingRange = range;
    if (this.source && this.sourceWanted) {
      this.source.revealRange(range);
      this.pendingRange = undefined;
    }
  };
  private async mountSource(version: number) {
    const module = await import('./JsonSource');
    if (!this.valid(version)) return;
    this.sourcePane.body.replaceChildren();
    this.source = new module.JsonSource(
      this.sourcePane.body,
      this.session.content.document!,
      this.options,
      this.zoom,
      this.context.stylePolicy,
      this.session.variant === 'jsonc' ? 'jsonc' : 'json',
      undefined,
      () => this.session.lineNumbers,
    );
    this.source.restorePosition(this.sourcePosition);
    if (this.pendingRange) {
      this.source.revealRange(this.pendingRange);
      this.pendingRange = undefined;
    }
  }
  private async mountTree(version: number) {
    this.treeStatus.hidden = false;
    this.treeStatus.textContent =
      this.options.locale === 'en-US'
        ? 'Reading JSON structure…'
        : '正在读取 JSON 结构…';
    try {
      const result = await this.session.ensureParsed();
      if (!this.valid(version)) return;
      if (!result || !['ready', 'invalid'].includes(result.kind))
        throw new Error('JSON 任务返回了无效结果');
      if (result.kind === 'invalid') {
        this.fail({
          ...(result.diagnostics.at(-1) ?? { message: 'JSON 语法无效' }),
          syntax: true,
        });
        return;
      }
      const module = await import('./JsonTree');
      if (!this.valid(version)) return;
      this.treeDiagnostics = result.document.diagnostics;
      this.updateTreeTitle();
      this.tree = new module.JsonTree(
        result.document,
        this.session.content.document!,
        this.host.ownerDocument,
        this.session.options.initialExpandDepth ?? 2,
        this.zoom,
        this.options.locale === 'en-US',
        () => {
          if (this.valid(this.generation)) this.onChange();
        },
        this.reveal,
      );
      this.treeStatus.hidden = true;
      this.treePane.body.append(this.tree.element);
      if (this.treeState) this.tree.restoreState(this.treeState);
    } catch (error) {
      if (this.valid(version))
        this.fail({
          message: error instanceof Error ? error.message : String(error),
        });
    }
  }
  private fail(failure: Failure | JsonDiagnostic) {
    this.failure = failure;
    this.layout();
    this.onChange();
    if (this.narrow) this.run();
  }
  private async reconcile() {
    if (!this.valid(this.generation) || !this.width) return;
    const version = ++this.generation;
    if (!this.sourceWanted) this.saveSource();
    if (!this.treeWanted) this.saveTree();
    this.layout();
    this.onChange();
    const work: Promise<void>[] = [];
    if (this.sourceWanted && !this.source)
      work.push(
        this.mountSource(version).catch((error) => {
          if (this.valid(version)) {
            this.sourcePane.body.textContent = String(error);
            this.sourcePane.body.setAttribute('role', 'alert');
          }
        }),
      );
    if (this.treeWanted && !this.tree && !this.failure)
      work.push(this.mountTree(version));
    await Promise.all(work);
    if (this.valid(version)) this.onChange();
  }
  private run() {
    void this.reconcile().catch((error) => {
      if (!this.closed && this.active) this.context.onError(error);
    });
  }
  /** 初次容器不可见时等待尺寸观察，不预加载任何隐藏区域。 */
  async initialize() {
    this.measure();
    await this.reconcile();
  }
  setMode(mode: 'tree' | 'source') {
    if (this.closed) return;
    this.session.mode = mode;
    this.run();
  }
  /** 工具栏只消费实际显示和就绪状态。 */
  getState() {
    return {
      mode: this.session.mode,
      narrow: this.narrow,
      treeReady: !!this.tree && !this.treePane.element.hidden,
      sourceReady: !!this.source && !this.sourcePane.element.hidden,
      treeVisible: !this.treePane.element.hidden,
    };
  }
  getBranchState() {
    return this.tree?.getBranchState();
  }
  toggleBranch() {
    this.tree?.toggleSelected();
  }
  getPath() {
    return this.tree?.getPath() ?? '';
  }
  showSearch() {
    if (this.focused === 'tree' && this.tree && !this.treePane.element.hidden)
      this.tree.showSearch();
    else if (this.source && !this.sourcePane.element.hidden)
      this.source.showSearch();
    else this.tree?.showSearch();
  }
  /** 普通选项更新保持区域状态，语言变化重建局部文案而不重读文件。 */
  update(options: ViewOptions, zoom: number) {
    const languageChanged = this.options.locale !== options.locale;
    this.options = options;
    this.zoom = zoom;
    if (languageChanged) {
      this.saveSource();
      this.saveTree();
      this.run();
    } else {
      this.source?.update(options, zoom);
      this.tree?.setZoom(zoom);
      this.layout();
    }
  }
  setActive(active: boolean) {
    this.active = active;
    this.source?.setActive(active);
    this.tree?.setActive(active);
    if (!active) {
      this.generation++;
      this.resize?.disconnect();
      this.updateSplit();
    } else {
      this.resize?.observe(this.host);
      this.measure();
      this.run();
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.resize?.disconnect();
    this.split.dispose();
    this.sourcePane.element.removeEventListener('focusin', this.focusSource);
    this.treePane.element.removeEventListener('focusin', this.focusTree);
    this.sourcePane.element.onpointerdown =
      this.treePane.element.onpointerdown = null;
    this.host.ownerDocument.defaultView?.removeEventListener(
      'resize',
      this.windowResize,
    );
    this.saveSource();
    this.saveTree();
    this.pendingRange = undefined;
    this.element.remove();
  }
}
