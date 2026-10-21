import type { DocumentSession } from '@filumo/core';
import { abortError, notify } from '@filumo/core';
import type {
  PresentationSource,
  PresentationSourceSnapshot,
} from '../../engine/presentation/PresentationSource';
/** 绑定渐进解析可能替换的 Source，不拥有解析器；旧请求不能跨版本交付。 */
export class PresentationSourceBinding implements PresentationSource {
  private current: PresentationSource;
  private snapshot: PresentationSourceSnapshot;
  private revision = 0;
  private listeners = new Set<() => void>();
  private stopSource: () => void;
  private stopSession: () => void;
  private closed = false;
  constructor(
    session: DocumentSession,
    private readonly resolve: () => PresentationSource,
  ) {
    this.current = resolve();
    this.snapshot = {
      ...this.current.getSnapshot(),
      revision: ++this.revision,
    };
    this.stopSource = this.current.subscribe(this.refresh);
    this.stopSession = session.subscribe(() => {
      const next = resolve();
      if (next !== this.current) {
        this.stopSource();
        this.current = next;
        this.stopSource = next.subscribe(this.refresh);
        this.refresh();
      }
    });
  }
  get identity() {
    return this.current;
  }
  get searchProvider() {
    return this.current.searchProvider;
  }
  getSnapshot = () => this.snapshot;
  private refresh = () => {
    if (this.closed) return;
    this.snapshot = {
      ...this.current.getSnapshot(),
      revision: ++this.revision,
    };
    notify(this.listeners);
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  async getSlide(index: number, signal?: AbortSignal) {
    const source = this.current;
    const value = await source.getSlide(index, signal);
    if (this.closed || source !== this.current) throw abortError();
    return value;
  }
  async getSpeakerNotes(index: number, signal?: AbortSignal) {
    const source = this.current;
    const value = await source.getSpeakerNotes(index, signal);
    if (this.closed || source !== this.current) throw abortError();
    return value;
  }
  async getAnnotations(index: number, signal?: AbortSignal) {
    const source = this.current;
    const value = await source.getAnnotations(index, signal);
    if (this.closed || source !== this.current) throw abortError();
    return value;
  }
  ensureRange(start: number, end: number, signal?: AbortSignal) {
    return this.current.ensureRange(start, end, signal);
  }
  retainRange(start: number, end: number) {
    return this.current.retainRange(start, end);
  }
  retry(index: number) {
    this.current.retry(index);
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    this.stopSource();
    this.stopSession();
    this.listeners.clear();
  }
}
