import { throwIfAborted } from '../errors';
import { waitForSource } from '../guardSource';

interface Entry {
  bytes?: Uint8Array;
  pending?: Promise<Uint8Array>;
  abort: AbortController;
  users: number;
}

/** 合并区间请求并限制闲置字节；取消一个等待者不影响仍在读取的其他等待者。 */
export class RangeCache {
  private entries = new Map<number, Entry>();
  private bytes = 0;
  constructor(private maxBytes = 4 * 1024 * 1024) {}
  async get(
    key: number,
    load: (signal: AbortSignal) => Promise<Uint8Array>,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    throwIfAborted(signal);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { abort: new AbortController(), users: 0 };
      const owned = entry;
      this.entries.set(key, owned);
      owned.pending = Promise.resolve()
        .then(() => load(owned.abort.signal))
        .then((bytes) => {
          throwIfAborted(owned.abort.signal);
          owned.bytes = bytes;
          owned.pending = undefined;
          this.bytes += bytes.byteLength;
          this.evict();
          return bytes;
        })
        .catch((error) => {
          if (this.entries.get(key) === owned) this.entries.delete(key);
          throw error;
        });
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    entry.users++;
    try {
      return entry.bytes ?? (await waitForSource(entry.pending!, signal));
    } finally {
      entry.users--;
      if (!entry.users && entry.pending) {
        entry.abort.abort();
        if (this.entries.get(key) === entry) this.entries.delete(key);
      }
      this.evict();
    }
  }
  private evict() {
    for (const [key, entry] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      if (!entry.bytes || entry.users) continue;
      this.bytes -= entry.bytes.byteLength;
      this.entries.delete(key);
    }
  }
  /** 来源退出后停止所有未完成请求并丢弃缓存。 */
  dispose(): void {
    for (const entry of this.entries.values()) entry.abort.abort();
    this.entries.clear();
    this.bytes = 0;
  }
}
