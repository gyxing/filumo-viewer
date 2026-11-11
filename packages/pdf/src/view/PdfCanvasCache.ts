import { FilumoError, notify } from '@filumo/core';
interface Entry {
  canvas: HTMLCanvasElement;
  bytes: number;
  users: number;
}
export interface PdfCanvasLease {
  canvas: HTMLCanvasElement;
  release(): void;
}
/** Canvas 按实际像素计费，仍在展示的租约不能被 LRU 淘汰。 */
export class PdfCanvasCache {
  private entries = new Map<string, Entry>();
  private bytes = 0;
  private availableListeners = new Set<() => void>();
  private availableRevision = 0;
  private notificationPending = false;
  private closed = false;
  get revision(): number {
    return this.availableRevision;
  }
  /** 最后一个使用者归还后容量才可重用；通知合并，避免在资源清理栈内重入。 */
  subscribeAvailable(listener: () => void): () => void {
    if (!this.closed) this.availableListeners.add(listener);
    return () => {
      this.availableListeners.delete(listener);
    };
  }
  constructor(
    private document: Document,
    readonly maxBytes = 96 * 1024 * 1024,
  ) {}
  acquire(key: string, width: number, height: number): PdfCanvasLease {
    let entry = this.entries.get(key);
    if (!entry) {
      const bytes = Math.ceil(width) * Math.ceil(height) * 4;
      this.evict(bytes);
      if (this.bytes + bytes > this.maxBytes)
        throw new FilumoError('PDF_CANVAS_BUDGET', '正在等待页面画布预算');
      const canvas = this.document.createElement('canvas');
      canvas.width = Math.ceil(width);
      canvas.height = Math.ceil(height);
      entry = { canvas, bytes, users: 0 };
      this.entries.set(key, entry);
      this.bytes += bytes;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    entry.users++;
    let released = false;
    return {
      canvas: entry.canvas,
      release: () => {
        if (!released) {
          released = true;
          entry!.users--;
          if (!entry!.users && !this.closed) {
            this.availableRevision++;
            if (!this.notificationPending) {
              this.notificationPending = true;
              queueMicrotask(() => {
                this.notificationPending = false;
                if (!this.closed) notify(this.availableListeners);
              });
            }
          }
        }
      },
    };
  }
  evict(required = 0): void {
    for (const [key, entry] of this.entries) {
      if (this.bytes + required <= this.maxBytes) break;
      if (entry.users) continue;
      entry.canvas.width = entry.canvas.height = 0;
      this.bytes -= entry.bytes;
      this.entries.delete(key);
    }
  }
  /** 清理结束后所有像素缓冲都显式归零。 */
  dispose(): void {
    this.closed = true;
    this.availableListeners.clear();
    for (const entry of this.entries.values())
      entry.canvas.width = entry.canvas.height = 0;
    this.entries.clear();
    this.bytes = 0;
  }
}
