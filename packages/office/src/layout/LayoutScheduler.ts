interface Task {
  key: string;
  read: () => unknown;
  write: (value: unknown) => void;
  cancelled: boolean;
}
/** 合并同键布局任务，读阶段完成后才写 DOM；替换、暂停和销毁阻止旧写入。 */
export class LayoutScheduler {
  private pending = new Map<string, Task>();
  private running = new Map<string, Task>();
  private active = true;
  private closed = false;
  private frame?: number;
  private flushing = false;
  constructor(
    private readonly window?: Window,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}
  schedule<T>(
    key: string,
    read: () => T,
    write: (value: T) => void,
  ): () => void {
    if (this.closed) return () => {};
    const previous = this.pending.get(key) ?? this.running.get(key);
    if (previous) previous.cancelled = true;
    const task: Task = {
      key,
      read,
      write: write as (value: unknown) => void,
      cancelled: false,
    };
    this.pending.set(key, task);
    this.request();
    return () => {
      task.cancelled = true;
      if (this.pending.get(key) === task) this.pending.delete(key);
    };
  }
  private request() {
    if (
      !this.pending.size ||
      !this.active ||
      this.closed ||
      this.flushing ||
      this.frame !== undefined ||
      !this.window
    )
      return;
    this.frame = this.window.requestAnimationFrame(() => {
      this.frame = undefined;
      void this.flush().catch(this.onError);
    });
  }
  async flush() {
    if (!this.active || this.closed || this.flushing) return;
    this.flushing = true;
    if (this.frame !== undefined) {
      this.window?.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    this.running = new Map(this.pending);
    this.pending.clear();
    const values: Array<{ task: Task; value: unknown }> = [];
    const errors: unknown[] = [];
    try {
      for (const task of this.running.values()) {
        if (task.cancelled || this.closed) continue;
        try {
          values.push({ task, value: task.read() });
        } catch (error) {
          errors.push(error);
        }
      }
      for (const { task, value } of values) {
        if (task.cancelled || this.closed) continue;
        if (!this.active) {
          if (!this.pending.has(task.key)) this.pending.set(task.key, task);
          continue;
        }
        try {
          task.write(value);
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      this.running.clear();
      this.flushing = false;
      this.request();
    }
    if (errors.length) throw new AggregateError(errors, 'Office 布局任务失败');
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active && this.frame !== undefined) {
      this.window?.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    if (active) this.request();
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    if (this.frame !== undefined) this.window?.cancelAnimationFrame(this.frame);
    this.pending.clear();
    this.running.clear();
  }
}
