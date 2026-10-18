import { abortError, notify, throwIfAborted } from '@fivo/core';
import { TextTaskClient } from './TextTaskClient';
import { decodeTextTask } from './tasks';
import type { TaskWorker, TextEncoding, TextEncodingWarning, TextReadResult } from './types';

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
  warning?: TextEncodingWarning;
  private listeners = new Set<() => void>();
  private controller = new AbortController();
  private decoding = new AbortController();
  private attempt = 0;
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
  /** 新编码成功后才提交内容版本，失败保留已有正文和解析任务。 */
  async setEncoding(encoding: TextEncoding) {
    if (this.closed) throw abortError();
    this.decoding.abort();
    const decoding = (this.decoding = new AbortController());
    const attempt = ++this.attempt;
    const previous = this.document;
    if (!previous) this.encoding = encoding;
    this.loading = true;
    this.warning = undefined;
    this.error = undefined;
    notify(this.listeners);
    try {
      const result = await this.client.run<TextReadResult>(
        'decode',
        { bytes: this.bytes, encoding, mimeType: this.mimeType },
        decoding.signal,
      );
      if (this.closed || attempt !== this.attempt || decoding.signal.aborted) return;
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
      if (result.kind === 'ready') {
        // 仅提交成功结果时淘汰旧版本；解码中的通知不会清空可见内容。
        this.controller.abort();
        this.controller = new AbortController();
        this.result = result;
        this.encoding = encoding;
        this.revision++;
      } else if (previous) {
        this.warning = { id: attempt, encoding, retainedEncoding: previous.encoding };
      } else this.result = result;
    } catch (error) {
      if (attempt !== this.attempt || this.closed || decoding.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      if (previous)
        this.warning = { id: attempt, encoding, retainedEncoding: previous.encoding, error: message };
      else this.error = message;
    } finally {
      if (attempt === this.attempt && !this.closed) {
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
    this.attempt++;
    this.decoding.abort();
    this.controller.abort();
    this.client.dispose();
    this.listeners.clear();
    this.bytes = new Uint8Array();
    this.result = undefined;
    this.warning = undefined;
    this.signal.removeEventListener('abort', this.dispose);
  };
}
