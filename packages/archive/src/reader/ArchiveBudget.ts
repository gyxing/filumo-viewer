import { FilumoError } from '@filumo/core';
import type { ArchiveResourcePolicy } from '../options';
// 各后端和嵌套共享根预算，Worker 重建不能重置已经发生的解压计数。
export const ARCHIVE_DEFAULTS = {
  maxEntries: 20000,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxNestedDepth: 2,
  cacheBytes: 64 * 1024 * 1024,
  maxWasmInputBytes: 64 * 1024 * 1024,
  maxFullReadBytes: 128 * 1024 * 1024,
} as const;
export class ArchiveBudget {
  readonly limits: Required<ArchiveResourcePolicy>;
  used: number;
  private pending?: Promise<void>;
  constructor(
    policy: ArchiveResourcePolicy = {},
    used = 0,
    private progress?: (bytes: number) => void | Promise<void>,
  ) {
    this.limits = { ...ARCHIVE_DEFAULTS, ...policy };
    this.used = used;
    for (const [key, value] of Object.entries(this.limits))
      if (
        !Number.isSafeInteger(value) ||
        value < (key === 'maxNestedDepth' ? 0 : 1)
      )
        throw new Error('归档预算必须是有效整数：' + key);
  }
  /** 以实际输出计费，包含扫描和重放；超限不交付部分正文。 */
  consume(bytes: number) {
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      this.used + bytes > this.limits.maxTotalUncompressedBytes
    )
      throw new FilumoError('ARCHIVE_TOTAL_LIMIT', '归档累计解压量超过限制');
    this.used += bytes;
    const result = this.progress?.(bytes);
    if (result) this.pending = result;
  }
  /** Worker 逐块等待根会话确认计费，取消并重建也不能丢弃累计预算。 */
  async checkpoint() {
    await this.pending;
    this.pending = undefined;
  }
  entry(size: number) {
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > this.limits.maxEntryBytes
    )
      throw new FilumoError('ARCHIVE_ENTRY_LIMIT', '文件超过单条目预览上限');
  }
  count(count: number) {
    if (count > this.limits.maxEntries)
      throw new FilumoError('ARCHIVE_ENTRIES_LIMIT', '归档文件数量超过限制');
  }
  depth(depth: number) {
    if (depth > this.limits.maxNestedDepth)
      throw new FilumoError('ARCHIVE_DEPTH_LIMIT', '压缩包嵌套超过限制');
  }
}
