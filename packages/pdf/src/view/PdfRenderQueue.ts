import { abortError } from '@filumo/core';
interface Work {
  key: string;
  page: number;
  generation: number;
  background: boolean;
  run(signal: AbortSignal): Promise<void>;
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}
/** 可见页优先的有界队列；代次改变后取消旧任务，完成清理后再补并发槽。 */
export class PdfRenderQueue {
  private pending = new Map<string, Work>();
  private running = new Map<
    string,
    { work: Work; abort: AbortController; promise: Promise<void> }
  >();
  private priority = new Map<number, number>();
  private generation = 0;
  private active = true;
  private closed = false;
  constructor(private concurrency = 2) {}
  updateWindow(
    visible: readonly number[],
    prefetch: readonly number[],
    generation: number,
  ): void {
    this.generation = generation;
    this.priority.clear();
    visible.forEach((page, index) => this.priority.set(page, index));
    prefetch.forEach((page, index) => {
      if (!this.priority.has(page))
        this.priority.set(page, visible.length + index);
    });
    for (const [key, work] of this.pending)
      if (
        work.generation !== generation ||
        (!work.background && !this.priority.has(work.page))
      ) {
        this.pending.delete(key);
        work.reject(abortError());
      }
    for (const value of this.running.values())
      if (
        value.work.generation !== generation ||
        (!value.work.background && !this.priority.has(value.work.page))
      )
        value.abort.abort(abortError());
    this.drain();
  }
  enqueue(
    key: string,
    page: number,
    generation: number,
    run: (signal: AbortSignal) => Promise<void>,
    background = false,
  ): Promise<void> {
    if (this.closed) return Promise.reject(abortError());
    const existing = this.pending.get(key) ?? this.running.get(key)?.work;
    if (existing) return existing.promise;
    let resolve!: () => void, reject!: (error: unknown) => void;
    const promise = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    this.pending.set(key, {
      key,
      page,
      generation,
      run,
      promise,
      resolve,
      reject,
      background,
    });
    this.drain();
    return promise;
  }
  private drain() {
    if (!this.active || this.closed) return;
    while (this.running.size < this.concurrency && this.pending.size) {
      const work = [...this.pending.values()].sort(
        (a, b) =>
          (this.priority.get(a.page) ?? Infinity) -
          (this.priority.get(b.page) ?? Infinity),
      )[0];
      this.pending.delete(work.key);
      if (
        work.generation !== this.generation ||
        (!work.background && !this.priority.has(work.page))
      ) {
        work.reject(abortError());
        continue;
      }
      const abort = new AbortController();
      const promise = Promise.resolve()
        .then(() => {
          if (abort.signal.aborted) throw abortError();
          return work.run(abort.signal);
        })
        .then(work.resolve, work.reject)
        .finally(() => {
          this.running.delete(work.key);
          this.drain();
        });
      this.running.set(work.key, { work, abort, promise });
    }
  }
  cancel(): void {
    for (const task of this.pending.values()) task.reject(abortError());
    this.pending.clear();
    for (const task of this.running.values()) task.abort.abort(abortError());
  }
  setActive(value: boolean): void {
    this.active = value;
    if (value) this.drain();
    else this.cancel();
  }
  async dispose(): Promise<void> {
    this.closed = true;
    this.cancel();
    await Promise.allSettled(
      [...this.running.values()].map((task) => task.promise),
    );
  }
}
