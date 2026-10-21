import { abortError, throwIfAborted } from '@filumo/core';
import { ManagedOfficeResourceStore } from '../engine/resource-store/OfficeResourceStore';
import type {
  OfficeResourceSource,
  OfficeResourceStore,
} from '../engine/resource-store/types';
export interface ResourceLease {
  readonly url: string;
  release(): void;
}
/** 视图拥有资源租约，原缓存和预算算法保持不变，Object URL 绑定当前 Document。 */
export class OfficeResourceService {
  readonly store: OfficeResourceStore;
  private releases = new Set<() => void>();
  private closed = false;
  private controller = new AbortController();
  private result?: Promise<void>;
  constructor(document: Document, store?: OfficeResourceStore) {
    this.store =
      store ??
      new ManagedOfficeResourceStore({ objectUrls: document.defaultView?.URL });
  }
  async acquire(
    source: OfficeResourceSource,
    signal?: AbortSignal,
  ): Promise<ResourceLease> {
    if (this.closed) throw abortError();
    if (signal) throwIfAborted(signal);
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason ?? abortError());
    signal?.addEventListener('abort', cancel, { once: true });
    this.controller.signal.addEventListener('abort', cancel, { once: true });
    try {
      const url = await this.store.acquire(source, controller.signal);
      if (this.closed || controller.signal.aborted) {
        this.store.release(source);
        throw abortError();
      }
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.releases.delete(release);
        this.store.release(source);
      };
      this.releases.add(release);
      return { url, release };
    } finally {
      signal?.removeEventListener('abort', cancel);
      this.controller.signal.removeEventListener('abort', cancel);
    }
  }
  dispose(): Promise<void> {
    if (this.result) return this.result;
    this.closed = true;
    this.controller.abort();
    for (const release of this.releases) release();
    this.result = this.store.dispose();
    return this.result;
  }
}
