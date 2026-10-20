import { FivoError } from '@fivo/core';
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
        throw new FivoError('PDF_CANVAS_BUDGET', '正在等待页面画布预算');
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
    for (const entry of this.entries.values())
      entry.canvas.width = entry.canvas.height = 0;
    this.entries.clear();
    this.bytes = 0;
  }
}
