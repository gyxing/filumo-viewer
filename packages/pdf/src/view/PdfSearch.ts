import { abortError, notify, throwIfAborted } from '@fivo/core';
import { PDF_DEFAULTS, type PdfOptions } from '../options';
import type { PdfBackend, PdfTextPage } from '../runtime/contracts';

export interface PdfMatch {
  pageIndex: number;
  start: number;
  end: number;
  preview: {
    before: string;
    match: string;
    after: string;
    leading: boolean;
    trailing: boolean;
  };
}

/** 查找模型与面板分离；暂停只停止扫描，已找到的结果和导航选择继续保留。 */
export class PdfSearch {
  private queryController = new AbortController();
  private navigationController = new AbortController();
  private scan?: { controller: AbortController; promise: Promise<void> };
  private cache = new Map<number, { value: PdfTextPage; bytes: number }>();
  private bytes = 0;
  private matches: PdfMatch[] = [];
  private listeners = new Set<() => void>();
  private active = true;
  private closed = false;
  private query = '';
  private current = -1;
  private searching = false;
  private truncated = false;
  private completed = true;
  private nextPage = 0;
  private queryRevision = 0;
  private navigationRevision = 0;
  private error?: string;
  constructor(private backend: PdfBackend, private options: PdfOptions) {}
  get signal(): AbortSignal {
    return this.navigationController.signal;
  }
  getSnapshot = () => ({
    query: this.query,
    resultCount: this.matches.length,
    currentIndex: this.current,
    searching: this.searching,
    truncated: this.truncated,
    completed: this.completed,
    scannedPages: this.nextPage,
    pageCount: this.backend.pageCount,
    queryRevision: this.queryRevision,
    navigationRevision: this.navigationRevision,
    error: this.error,
  });
  getCurrent = (): PdfMatch | undefined => this.matches[this.current];
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    if (!this.closed) notify(this.listeners);
  }
  private navigate() {
    this.navigationController.abort();
    this.navigationController = new AbortController();
    this.navigationRevision++;
  }
  /** 按窗口交付结果，不向面板复制整份匹配数组。 */
  getResults(start: number, count: number): readonly PdfMatch[] {
    return this.matches.slice(
      Math.max(0, start),
      Math.max(0, start) + Math.max(0, count),
    );
  }
  /** 文本缓存按估算字节计费，结果预览只保留短片段，避免复制完整页面内容。 */
  async text(page: number, signal: AbortSignal): Promise<PdfTextPage> {
    throwIfAborted(signal);
    if (this.closed) throw abortError();
    const cached = this.cache.get(page);
    if (cached) {
      this.cache.delete(page);
      this.cache.set(page, cached);
      return cached.value;
    }
    const value = await this.backend.readText(page, signal);
    throwIfAborted(signal);
    if (this.closed) throw abortError();
    void this.backend.cleanupPage(page).catch(() => undefined);
    const bytes = value.text.length * 2 + value.runs.length * 64,
      budget = this.options.textCacheBytes ?? PDF_DEFAULTS.textCacheBytes;
    const previous = this.cache.get(page);
    if (previous) {
      this.bytes -= previous.bytes;
      this.cache.delete(page);
    }
    while (this.bytes + bytes > budget && this.cache.size) {
      const key = this.cache.keys().next().value!;
      this.bytes -= this.cache.get(key)!.bytes;
      this.cache.delete(key);
    }
    if (bytes <= budget) {
      this.cache.set(page, { value, bytes });
      this.bytes += bytes;
    }
    return value;
  }
  private match(
    pageIndex: number,
    text: string,
    start: number,
    end: number,
  ): PdfMatch {
    const before = Math.max(0, start - 36),
      after = Math.min(text.length, end + 48),
      visibleEnd = Math.min(end, start + 80);
    const readable = (value: string) => value.replace(/\s+/g, ' ');
    return {
      pageIndex,
      start,
      end,
      preview: {
        before: readable(text.slice(before, start)),
        match:
          readable(text.slice(start, visibleEnd)) +
          (visibleEnd < end ? '…' : ''),
        after: readable(text.slice(end, after)),
        leading: before > 0,
        trailing: after < text.length,
      },
    };
  }
  /** 新查询重置游标，旧查询的迟到读取不得追加到新结果。 */
  async setQuery(query: string): Promise<void> {
    if (this.closed) return;
    this.queryController.abort();
    this.scan?.controller.abort();
    this.queryController = new AbortController();
    this.query = query;
    this.matches = [];
    this.current = -1;
    this.nextPage = 0;
    this.truncated = false;
    this.error = undefined;
    this.completed = !query;
    this.searching = false;
    this.queryRevision++;
    this.navigate();
    this.publish();
    await this.resume();
  }
  /** 从未完成页面继续扫描；已有任务、已完成查询或非活动面板不重复启动。 */
  resume(): Promise<void> {
    if (
      this.closed ||
      !this.active ||
      !this.query ||
      this.completed ||
      this.truncated ||
      this.error
    )
      return Promise.resolve();
    if (this.scan && !this.scan.controller.signal.aborted)
      return this.scan.promise;
    const controller = new AbortController(),
      signal = controller.signal,
      lifetime = this.queryController.signal;
    const cancel = () => controller.abort(lifetime.reason);
    lifetime.addEventListener('abort', cancel, { once: true });
    const job = { controller, promise: Promise.resolve() };
    this.scan = job;
    this.searching = true;
    this.publish();
    job.promise = Promise.resolve()
      .then(async () => {
        const limit =
          this.options.maxSearchMatches ?? PDF_DEFAULTS.maxSearchMatches;
        while (this.nextPage < this.backend.pageCount) {
          throwIfAborted(signal);
          const page = this.nextPage,
            model = await this.text(page, signal);
          throwIfAborted(signal);
          let offset = 0;
          while (offset <= model.text.length) {
            const start = model.text.indexOf(this.query, offset);
            if (start < 0) break;
            this.matches.push(
              this.match(page, model.text, start, start + this.query.length),
            );
            offset = start + Math.max(1, this.query.length);
            if (this.current < 0) {
              this.current = 0;
              this.navigate();
            }
            if (this.matches.length >= limit) {
              this.truncated = true;
              break;
            }
          }
          this.nextPage = page + 1;
          this.completed =
            this.truncated || this.nextPage >= this.backend.pageCount;
          this.publish();
          if (this.completed) break;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      })
      .catch((cause) => {
        if (!signal.aborted && !this.closed) this.error = String(cause);
      })
      .finally(() => {
        lifetime.removeEventListener('abort', cancel);
        if (this.scan === job) {
          this.scan = undefined;
          this.searching = false;
          this.publish();
        }
      });
    return job.promise;
  }
  /** 明确选择结果才增加导航版本，Tab 切换或扫描进度不触发正文跳页。 */
  select(index: number): void {
    if (
      this.closed ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.matches.length
    )
      return;
    this.current = index;
    this.navigate();
    this.publish();
  }
  async next(): Promise<void> {
    if (this.matches.length)
      this.select((this.current + 1) % this.matches.length);
  }
  async previous(): Promise<void> {
    if (this.matches.length)
      this.select(
        (this.current - 1 + this.matches.length) % this.matches.length,
      );
  }
  setActive(value: boolean): void {
    if (this.closed || value === this.active) return;
    this.active = value;
    if (value) void this.resume();
    else {
      this.scan?.controller.abort();
      this.searching = false;
      this.publish();
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.queryController.abort();
    this.navigationController.abort();
    this.scan?.controller.abort();
    this.cache.clear();
    this.matches = [];
    this.bytes = 0;
    this.listeners.clear();
  }
}
