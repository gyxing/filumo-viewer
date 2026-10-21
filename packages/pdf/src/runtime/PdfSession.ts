import type { DocumentSource, OpenContext } from '@filumo/core';
import { FilumoError, abortError, notify, throwIfAborted } from '@filumo/core';
import type { PdfOptions } from '../options';
import { createPdfBackend, waitPdf } from './PdfBackend';
import { createPdfRangeTransport } from './PdfRangeTransport';
import type { PdfBackend } from './contracts';
import { pdfError } from './errors';
import { getPdfAssets } from './pdfAssets';
import type {
  EngineLoadingTask,
  EngineRangeTransport,
  PdfEngine,
} from './pdfEngine';

export interface PdfSessionSnapshot {
  phase: 'loading' | 'password' | 'ready' | 'error';
  pageCount?: number;
  passwordIncorrect: boolean;
  firstPageReady: boolean;
  error?: Error;
}
/** PDF 会话持有引擎和 Worker，密码恢复及页面状态不依赖框架实例。 */
export class PdfSession {
  private state: PdfSessionSnapshot = {
    phase: 'loading',
    passwordIncorrect: false,
    firstPageReady: false,
  };
  private listeners = new Set<() => void>();
  private backend?: PdfBackend;
  private task?: EngineLoadingTask;
  private transport?: EngineRangeTransport;
  private worker?: Worker;
  private pdfWorker?: { destroy(): void };
  private controller = new AbortController();
  private password?: (value: string) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private disposing?: Promise<void>;
  private stoppingTask?: Promise<void>;
  constructor(
    readonly source: DocumentSource,
    private context: OpenContext,
    readonly options: PdfOptions,
  ) {
    context.signal.addEventListener('abort', this.cancel, { once: true });
  }
  getSnapshot = () => this.state;
  getBackend = () => this.backend;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Partial<PdfSessionSnapshot>) {
    if (!this.disposing) {
      this.state = { ...this.state, ...next };
      notify(this.listeners);
    }
  }
  private cancel = () => {
    void this.dispose().catch(() => undefined);
  };
  private stopTask(): Promise<void> {
    return (this.stoppingTask ??= Promise.resolve()
      .then(() => this.task?.destroy())
      .then(() => undefined));
  }
  async initialize(): Promise<void> {
    const signal = this.controller.signal;
    throwIfAborted(this.context.signal);
    const assets = await getPdfAssets(this.options);
    throwIfAborted(signal);
    // 默认引擎进入宿主资源图；仅宿主显式指定整套资源时才保留外部导入。
    const engine = (this.options.assetsBaseUrl === undefined
      ? await import('pdfjs-dist/legacy/build/pdf.mjs')
      : await import(
          /* webpackIgnore: true */ /* @vite-ignore */ assets.display
        )) as unknown as PdfEngine;
    throwIfAborted(signal);
    if (engine.version !== '6.4.299')
      throw new FilumoError(
        'PDF_ENGINE_VERSION_MISMATCH',
        'PDF 引擎资源版本不一致',
      );
    const { createPdfWorker } = await import('@filumo/pdf/assets');
    throwIfAborted(signal);
    this.worker = createPdfWorker(this.options, assets);
    this.pdfWorker = new engine.PDFWorker({ port: this.worker });
    const reader = await this.source.getRangeReader?.(signal);
    throwIfAborted(signal);
    const initial = reader
      ? await reader.read(0, Math.min(reader.length, 256 * 1024), signal)
      : undefined;
    throwIfAborted(signal);
    let ready!: () => void, fail!: (cause: unknown) => void;
    const first = new Promise<void>((resolve, reject) => {
      ready = resolve;
      fail = reject;
    });
    if (reader)
      this.transport = createPdfRangeTransport(
        engine,
        reader,
        signal,
        (error) => {
          const reason = pdfError(error);
          this.publish({ phase: 'error', error: reason });
          fail(reason);
          void this.stopTask().catch(() => undefined);
        },
        initial,
        (loaded, total) =>
          this.context.reportProgress({ phase: '读取 PDF', loaded, total }),
      );
    // 仅 PDF 层持有可转移副本，Core 原始缓存继续供下载和其他来源能力使用。
    const data = reader
      ? undefined
      : (await this.source.readAll(signal)).slice();
    throwIfAborted(signal);
    this.task = engine.getDocument({
      data,
      range: this.transport,
      length: reader?.length,
      rangeChunkSize: 256 * 1024,
      disableAutoFetch: true,
      disableStream: true,
      worker: this.pdfWorker,
      cMapUrl: assets.cMap,
      cMapPacked: true,
      standardFontDataUrl: assets.standardFonts,
      wasmUrl: assets.wasm,
      iccUrl: assets.icc,
      // 默认适配在 Worker 内解析资源，保持 PDF.js 的 ICC 色彩处理能力。
      useWorkerFetch: true,
      useWasm: this.options.useWasm ?? true,
      enableXfa: false,
      isEvalSupported: false,
    });
    this.task.onPassword = (update, reason) => {
      if (signal.aborted) return;
      if (this.timer) clearTimeout(this.timer);
      this.password = update;
      this.publish({
        phase: 'password',
        passwordIncorrect: reason === 2,
        error: undefined,
      });
      ready();
      this.context.reportProgress(undefined);
    };
    this.task.onProgress = (value) => {
      if (!signal.aborted)
        this.context.reportProgress({ phase: '读取 PDF', ...value });
    };
    void this.task.promise
      .then(async (document) => {
        if (signal.aborted) return;
        this.backend = createPdfBackend(document, engine, assets, signal);
        await this.backend.getMetrics(0, signal);
        if (this.timer) clearTimeout(this.timer);
        this.password = undefined;
        this.context.reportProgress(undefined);
        this.publish({
          phase: 'ready',
          pageCount: document.numPages,
          passwordIncorrect: false,
        });
        ready();
      })
      .catch((cause) => {
        if (signal.aborted) return;
        if (this.timer) clearTimeout(this.timer);
        // 传输失败或解锁超时先给出的具体原因，应保留到引擎完成退出。
        const error =
          this.state.phase === 'error' && this.state.error
            ? this.state.error
            : pdfError(cause);
        this.context.reportProgress(undefined);
        this.publish({ phase: 'error', error });
        fail(error);
      });
    await waitPdf(first, signal);
  }
  /** 密码仅交给引擎回调，不写入快照或日志。 */
  submitPassword(value: string): void {
    if (!this.password || this.disposing) return;
    const reply = this.password;
    this.password = undefined;
    this.publish({ phase: 'loading', error: undefined });
    if (this.context.resourcePolicy?.timeoutMs)
      this.timer = setTimeout(() => {
        this.publish({
          phase: 'error',
          error: new FilumoError('LOAD_TIMEOUT', 'PDF 解锁读取超时'),
        });
        void this.stopTask().catch(() => undefined);
      }, this.context.resourcePolicy.timeoutMs);
    reply(value);
  }
  setFirstPageReady(): void {
    if (!this.state.firstPageReady) this.publish({ firstPageReady: true });
  }
  /** 重复退出只执行一次清理，先停止页面任务，再关闭引擎和实际 Worker。 */
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.controller.abort(abortError());
    this.context.signal.removeEventListener('abort', this.cancel);
    if (this.timer) clearTimeout(this.timer);
    this.transport?.abort();
    this.password = undefined;
    this.listeners.clear();
    this.disposing = Promise.resolve().then(async () => {
      try {
        await this.backend?.dispose();
      } finally {
        try {
          await this.stopTask();
        } finally {
          try {
            this.pdfWorker?.destroy();
          } finally {
            this.worker?.terminate();
          }
        }
      }
    });
    return this.disposing;
  }
}
