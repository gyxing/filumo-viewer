import { abortError, throwIfAborted } from '../errors';
import type { TaskWorker } from './types';
interface Pending {
  task: string;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  stop(): void;
}
/** 首次真实任务才创建 Worker；失败和取消均清理队列，构造不访问浏览器对象。 */
export class TextTaskClient {
  private worker?: TaskWorker;
  private disabled = false;
  private closed = false;
  private sequence = 0;
  private pending = new Map<number, Pending>();
  constructor(
    private readonly options: {
      mode: 'auto' | 'always' | 'never';
      factory: () => TaskWorker;
      executeLocal(
        task: string,
        payload: unknown,
        signal: AbortSignal,
      ): Promise<unknown>;
    },
  ) {}
  private message = (event: { data: unknown }) => {
    const data = event.data as {
      id?: unknown;
      task?: unknown;
      ok?: unknown;
      value?: unknown;
      error?: unknown;
    };
    if (!data || typeof data.id !== 'number' || typeof data.ok !== 'boolean') {
      this.failure();
      return;
    }
    const pending = this.pending.get(data.id);
    if (!pending) return;
    if (pending.task !== data.task) {
      this.failure();
      return;
    }
    this.pending.delete(data.id);
    pending.stop();
    if (data.ok) pending.resolve(data.value);
    else
      pending.reject(
        new Error(typeof data.error === 'string' ? data.error : '文本任务失败'),
      );
  };
  private failure = () => {
    this.disabled = true;
    this.clearWorker(new Error('文本 Worker 不可用'));
  };
  private clearWorker(error: unknown) {
    if (this.worker) {
      this.worker.removeEventListener('message', this.message);
      this.worker.removeEventListener('error', this.failure);
      this.worker.removeEventListener('messageerror', this.failure);
      this.worker.terminate();
      this.worker = undefined;
    }
    for (const pending of this.pending.values()) {
      pending.stop();
      pending.reject(error);
    }
    this.pending.clear();
  }
  /** 执行受协议约束的任务，auto 仅在基础设施失败时切换本地实现。 */
  async run<T>(
    task: string,
    payload: unknown,
    signal: AbortSignal,
  ): Promise<T> {
    if (this.closed) throw new Error('文本任务客户端已释放');
    throwIfAborted(signal);
    if (
      this.options.mode === 'never' ||
      (this.disabled && this.options.mode === 'auto')
    )
      return this.options.executeLocal(task, payload, signal) as Promise<T>;
    if (!this.worker) {
      try {
        this.worker = this.options.factory();
        this.worker.addEventListener('message', this.message);
        this.worker.addEventListener('error', this.failure);
        this.worker.addEventListener('messageerror', this.failure);
      } catch (error) {
        this.failure();
        if (this.options.mode === 'always') throw error;
        return this.options.executeLocal(task, payload, signal) as Promise<T>;
      }
    }
    try {
      return await new Promise<T>((resolve, reject) => {
        const id = ++this.sequence;
        const abort = () => {
          const pending = this.pending.get(id);
          if (!pending) return;
          this.pending.delete(id);
          pending.stop();
          pending.reject(signal.reason ?? abortError());
          try {
            this.worker?.postMessage({ id, task, cancel: true });
          } catch {
            /* 取消信封发送失败不覆盖原始取消原因。 */
          }
          // 编码尝试与原内容解析可能并行；仍有使用者时不能销毁共享 Worker。
          if (!this.pending.size)
            this.clearWorker(signal.reason ?? abortError());
        };
        signal.addEventListener('abort', abort, { once: true });
        this.pending.set(id, {
          task,
          resolve: (value) => resolve(value as T),
          reject,
          stop: () => signal.removeEventListener('abort', abort),
        });
        try {
          this.worker!.postMessage({ id, task, payload });
        } catch {
          this.failure();
        }
        if (signal.aborted) abort();
      });
    } catch (error) {
      throwIfAborted(signal);
      if (!this.closed && this.disabled && this.options.mode === 'auto')
        return this.options.executeLocal(task, payload, signal) as Promise<T>;
      throw error;
    }
  }
  /** 释放后不允许后续任务重新创建 Worker。 */
  dispose() {
    this.closed = true;
    this.clearWorker(abortError());
  }
}
