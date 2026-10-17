import { abortError, notify, throwIfAborted } from '@fivo/core';
import { TextTaskClient } from './TextTaskClient';
import { decodeTextTask } from './tasks';
import type { TaskWorker, TextEncoding, TextReadResult } from './types';

export interface TextContentOptions {
  encoding?: TextEncoding;
  /** 保存读取后的来源声明，重新选择自动时沿用而不再次请求文件。 */
  mimeType?: string;
  worker?: 'auto' | 'always' | 'never';
  workerFactory: () => TaskWorker;
}
/** 文件字节只由会话持有，切换编码和模式复用当前来源，不拥有来源释放权。 */
export class TextContent {
  result?: TextReadResult;
  error?: string;
  loading = false;
  revision = 0;
  encoding: TextEncoding;
  private listeners = new Set<() => void>();
  private controller = new AbortController();
  private closed = false;
  private client: TextTaskClient;
  private mimeType?: string;
  constructor(
    private bytes: Uint8Array,
    options: TextContentOptions,
    private signal: AbortSignal,
    execute?: (
      task: string,
      payload: unknown,
      signal: AbortSignal,
    ) => Promise<unknown>,
  ) {
    this.encoding = options.encoding ?? 'auto';
    this.mimeType = options.mimeType;
    this.client = new TextTaskClient({
      mode: options.worker ?? 'auto',
      factory: options.workerFactory,
      executeLocal: (task, payload, current) =>
        task === 'decode'
          ? decodeTextTask(payload, current)
          : execute
          ? execute(task, payload, current)
          : Promise.reject(new Error('未知文本任务')),
    });
    signal.addEventListener('abort', this.dispose, { once: true });
    if (signal.aborted) this.dispose();
  }
  get document() {
    return this.result?.kind === 'ready' ? this.result.document : undefined;
  }
  get taskSignal() {
    return this.controller.signal;
  }
  /** 编码改变使旧解析和高亮失效，失败时保留编码选择入口。 */
  async setEncoding(encoding: TextEncoding) {
    if (this.closed) throw abortError();
    this.controller.abort();
    this.controller = new AbortController();
    this.encoding = encoding;
    const revision = ++this.revision;
    this.loading = true;
    this.result = undefined;
    this.error = undefined;
    notify(this.listeners);
    try {
      const result = await this.client.run<TextReadResult>(
        'decode',
        { bytes: this.bytes, encoding, mimeType: this.mimeType },
        this.taskSignal,
      );
      if (this.closed || revision !== this.revision) return;
      if (
        !result ||
        !['ready', 'needs-encoding'].includes(result.kind) ||
        (result.kind === 'ready' &&
          (typeof result.document?.text !== 'string' ||
            !(result.document.lineStarts instanceof Uint32Array) ||
            !result.document.lineStarts.length ||
            result.document.lineStarts[0] !== 0))
      )
        throw new Error('解码任务返回了无效内容');
      this.result = result;
    } catch (error) {
      if (revision !== this.revision || this.closed) return;
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (revision === this.revision && !this.closed) {
        this.loading = false;
        notify(this.listeners);
      }
    }
  }
  /** 格式任务由对应包分发，读取层不静态引用格式引擎。 */
  async run<T>(task: string, payload: unknown): Promise<T> {
    throwIfAborted(this.signal);
    throwIfAborted(this.taskSignal);
    return this.client.run<T>(task, payload, this.taskSignal);
  }
  /** 订阅仅用于当前文件的可恢复读取状态。 */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** 幂等终止任务，原文件由 Core 会话单独释放。 */
  dispose = () => {
    if (this.closed) return;
    this.closed = true;
    this.revision++;
    this.controller.abort();
    this.client.dispose();
    this.listeners.clear();
    this.bytes = new Uint8Array();
    this.result = undefined;
    this.signal.removeEventListener('abort', this.dispose);
  };
}
