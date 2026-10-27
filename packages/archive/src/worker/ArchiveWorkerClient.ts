import { FilumoError, abortError, throwIfAborted } from '@filumo/core';
import type { ArchiveOptions } from '../options';
import type { ArchiveBudget } from '../reader/ArchiveBudget';
import type { ArchiveEntry, ArchiveFormat } from '../reader/contracts';
import { SourceBridge } from './SourceBridge';
import type {
  ArchiveReply,
  ArchiveSourceInfo,
  SourceRequest,
} from './protocol';

/** 每个归档会话串行执行任务，WASM 忙碌时通过终止 Worker 保证取消。 */
export class ArchiveWorkerClient {
  readonly bridge: SourceBridge;
  private worker?: Worker;
  private sequence = 0;
  private stop?: () => void;
  private closed = false;
  constructor(private options: ArchiveOptions, readonly budget: ArchiveBudget) {
    this.bridge = new SourceBridge(budget);
  }
  private async request(
    source: ArchiveSourceInfo,
    format: ArchiveFormat,
    op: 'open' | 'extract',
    signal: AbortSignal,
    entryId?: string,
  ): Promise<ArchiveReply & { ok: true }> {
    throwIfAborted(signal);
    if (this.closed) throw new Error('归档会话已释放');
    if (this.stop) throw new Error('归档任务尚未结束');
    // 默认入口由描述符统一注入，避免开发构建静态解析一条不存在的相对 Worker 路径。
    const worker = (this.worker ??= this.options.workerFactory?.());
    if (!worker) throw new Error('归档插件未提供 Worker 创建方式');
    const id = ++this.sequence,
      abort = new AbortController();
    return new Promise((resolve, reject) => {
      let done = false;
      let cancel: () => void,
        message: (event: MessageEvent) => void,
        failed: (event: ErrorEvent) => void;
      const finish = () => {
        done = true;
        signal.removeEventListener('abort', cancel);
        worker.removeEventListener('message', message);
        worker.removeEventListener('error', failed);
        this.stop = undefined;
      };
      cancel = () => {
        if (done) return;
        abort.abort(signal.reason ?? abortError());
        finish();
        worker.terminate();
        if (this.worker === worker) this.worker = undefined;
        void this.bridge.cancelStreams();
        // 终止可能发生在一块输出计费确认之间，保守保留一块额度，不能借取消刷新预算。
        const reserve = Math.min(
          256 * 1024,
          this.budget.limits.maxTotalUncompressedBytes - this.budget.used,
        );
        if (reserve > 0) this.budget.consume(reserve);
        reject(signal.reason ?? abortError());
      };
      failed = (event: ErrorEvent) => {
        if (done) return;
        abort.abort();
        finish();
        worker.terminate();
        this.worker = undefined;
        void this.bridge.cancelStreams();
        reject(new Error(event.message || '归档 Worker 无法运行'));
      };
      message = (event: MessageEvent) => {
        const value = event.data as ArchiveReply & Partial<SourceRequest>;
        if (typeof value.sourceCall === 'number') {
          void this.bridge
            .reply(value as unknown as SourceRequest, abort.signal)
            .then((reply) => {
              if (!done) {
                const bytes =
                  reply.value instanceof Uint8Array ? reply.value : undefined;
                worker.postMessage(reply, bytes ? [bytes.buffer] : []);
              }
            })
            .catch(() => undefined);
          return;
        }
        if (value.id !== id || done) return;
        finish();
        if (value.ok) resolve(value);
        else {
          worker.terminate();
          this.worker = undefined;
          abort.abort();
          void this.bridge.cancelStreams();
          reject(
            value.code
              ? new FilumoError(value.code, value.message)
              : new Error(value.message),
          );
        }
      };
      this.stop = cancel;
      signal.addEventListener('abort', cancel, { once: true });
      worker.addEventListener('message', message);
      worker.addEventListener('error', failed);
      worker.postMessage({
        id,
        op,
        source,
        format,
        entryId,
        policy: this.budget.limits,
        used: this.budget.used,
        assetsBaseUrl: this.options.assetsBaseUrl,
      });
      if (signal.aborted) cancel();
    });
  }
  async scan(
    source: ArchiveSourceInfo,
    format: ArchiveFormat,
    signal: AbortSignal,
  ): Promise<ArchiveEntry[]> {
    const entries = (await this.request(source, format, 'open', signal))
      .entries;
    if (
      !Array.isArray(entries) ||
      entries.length > this.budget.limits.maxEntries ||
      entries.some(
        (entry) =>
          !entry ||
          typeof entry.id !== 'string' ||
          typeof entry.path !== 'string' ||
          !['file', 'directory', 'unsupported'].includes(entry.kind) ||
          !Number.isSafeInteger(entry.size) ||
          entry.size < 0,
      )
    )
      throw new Error('归档 Worker 返回了无效目录');
    return entries;
  }
  async extract(
    source: ArchiveSourceInfo,
    format: ArchiveFormat,
    id: string,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const bytes = (await this.request(source, format, 'extract', signal, id))
      .bytes;
    if (!(bytes instanceof Uint8Array))
      throw new Error('归档 Worker 返回了无效正文');
    return bytes;
  }
  cancel() {
    this.stop?.();
  }
  /** 返回上级时连空闲引擎一并释放，下一次读取按根预算重建。 */
  async reset() {
    this.stop?.();
    this.worker?.terminate();
    this.worker = undefined;
    await this.bridge.cancelStreams();
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    this.stop?.();
    this.worker?.terminate();
    this.worker = undefined;
    await this.bridge.dispose();
  }
}
