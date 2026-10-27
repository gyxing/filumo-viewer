import type {
  ViewContext,
  ViewerCapabilities,
  ViewerHandle,
} from '@filumo/dom';
import type { ArchiveEntry } from '../reader/contracts';
import type { ArchiveSession } from '../runtime/ArchiveSession';
import { EntryResources } from './EntryResources';
import { projectCapabilities } from './projectCapabilities';
/** 只使用宿主注入的查看器，保持插件集合与框架无关。 */
export class EntryPreview {
  private viewer?: ViewerHandle;
  private resources?: EntryResources;
  private abort?: AbortController;
  private mount?: HTMLElement;
  private version = 0;
  private closed = false;
  private stop?: () => void;
  private ready = false;
  private active = true;
  private currentCapabilities: ViewerCapabilities = {};
  constructor(
    private context: ViewContext,
    private session: ArchiveSession,
    private host: HTMLElement,
    private changed: () => void = () => {},
  ) {}
  get capabilities() {
    return this.currentCapabilities;
  }
  private async release() {
    const abort = this.abort,
      viewer = this.viewer,
      resources = this.resources,
      mount = this.mount;
    this.abort = undefined;
    this.viewer = undefined;
    this.resources = undefined;
    this.mount = undefined;
    this.stop?.();
    this.stop = undefined;
    this.ready = false;
    this.currentCapabilities = {};
    this.changed();
    // 先移交并释放本次所有权，迟到的异步销毁不能清空后续预览。
    abort?.abort();
    resources?.dispose();
    mount?.remove();
    await viewer?.destroy();
  }
  async clear() {
    this.version++;
    await this.release();
  }
  async open(entry: ArchiveEntry, signal: AbortSignal) {
    const version = ++this.version;
    await this.release();
    if (this.closed || signal.aborted || version !== this.version) return;
    if (!this.context.createChildViewer)
      throw new Error('宿主未提供子文档预览能力，请下载文件查看');
    const bytes = await this.session.bytes(entry, signal);
    if (this.closed || signal.aborted || version !== this.version) return;
    const window = this.host.ownerDocument.defaultView;
    if (!window) throw new Error('预览窗口不可用');
    const abort = (this.abort = new AbortController()),
      cancel = () => abort.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    const resources = (this.resources = new EntryResources(
      this.session,
      this.session.current,
      entry.path,
      abort.signal,
      window,
    ));
    const mount = (this.mount = this.host.ownerDocument.createElement('div'));
    mount.className = 'filumo-archive-child';
    this.host.append(mount);
    let viewer: ViewerHandle | undefined;
    try {
      viewer = this.context.createChildViewer(mount, {
        height: '100%',
        toolbar: false,
      });
      this.viewer = viewer;
      const child = viewer;
      const publish = () => {
        if (this.viewer !== child || version !== this.version || !this.ready)
          return;
        this.currentCapabilities = projectCapabilities(
          child.getCapabilities?.() ?? {},
          () =>
            !this.closed &&
            this.active &&
            this.ready &&
            this.viewer === child &&
            version === this.version,
        );
        this.changed();
      };
      this.stop = child.subscribeCapabilities?.(publish);
      await viewer.open(
        new File([bytes], entry.path.split('/').pop() ?? 'file'),
        { resources: resources.resources },
      );
      if (this.viewer === child && version === this.version && !this.closed) {
        this.ready = true;
        child.setActive(this.active);
        publish();
      }
    } catch (error) {
      if (version === this.version) await this.release();
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }
  setActive(active: boolean) {
    this.active = active;
    this.viewer?.setActive(active);
  }
  async dispose() {
    this.closed = true;
    await this.clear();
  }
}
