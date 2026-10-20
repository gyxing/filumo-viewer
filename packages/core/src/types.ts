/** 格式无关的输入读取限制；格式插件可以扩展自己的限制。 */
export interface ResourcePolicy {
  maxFileBytes?: number;
  timeoutMs?: number;
}
export type { DocumentRangeReader } from './range/types';
export interface DocumentSource {
  readonly name?: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly url?: string;
  readAll(signal: AbortSignal): Promise<Uint8Array>;
  /** 可直接交付不可变的本地 Blob；不具备此能力时返回 undefined，调用方回退到 readAll。 */
  readBlob?(signal: AbortSignal): Promise<Blob | undefined>;
  /** 明确提供高效区间能力；未实现时调用方继续使用原有读取路径。 */
  getRangeReader?(
    signal: AbortSignal,
  ): Promise<import('./range/types').DocumentRangeReader | undefined>;
  readRange?(
    offset: number,
    length: number,
    signal: AbortSignal,
  ): Promise<Uint8Array>;
  dispose(): Promise<void>;
}
export type DocumentInput =
  | File
  | Blob
  | Uint8Array
  | string
  | { url: string; name?: string; mimeType?: string; request?: RequestInit }
  | (() => DocumentSource | Promise<DocumentSource>);
/** 单次打开可显式选择已经注册的插件，不隐式安装其他格式。 */
export interface DocumentOpenOptions {
  pluginId?: string;
}
export type DocumentStatus =
  | 'idle'
  | 'detecting'
  | 'loading'
  | 'ready'
  | 'error'
  | 'cancelled'
  | 'disposed';
export interface DocumentSnapshot {
  sessionId: string;
  format: string;
  status: DocumentStatus;
  metadata: { name?: string; size?: number };
  partialReady?: boolean;
  progress?: { phase: string; loaded?: number; total?: number };
  error?: Error;
}
export interface DocumentSession<T = unknown> {
  readonly id: string;
  readonly signal: AbortSignal;
  readonly source: DocumentSource;
  readonly data: T;
  getSnapshot(): DocumentSnapshot;
  subscribe(listener: () => void): () => void;
  cancel(reason?: unknown): void;
  dispose(): Promise<void>;
}
export interface OpenContext {
  sessionId: string;
  signal: AbortSignal;
  resourcePolicy?: ResourcePolicy;
  reportProgress(progress: DocumentSnapshot['progress']): void;
}
export interface DocumentDriver<T = unknown> {
  open(
    source: DocumentSource,
    context: OpenContext,
  ): Promise<DocumentSession<T>>;
}
export interface DocumentPlugin<T = unknown> {
  readonly id: string;
  readonly protocolVersion: 1;
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
  readonly priority?: number;
  detect(source: DocumentSource, signal: AbortSignal): Promise<boolean>;
  /** 仅常规探测全部拒绝时调用；策略用于限制探测范围，不加载未注册的实现。 */
  detectFallback?(
    source: DocumentSource,
    signal: AbortSignal,
    resourcePolicy?: ResourcePolicy,
  ): Promise<boolean>;
  load(): Promise<DocumentDriver<T>>;
}
export interface ControllerSnapshot {
  status: DocumentStatus;
  session?: DocumentSession;
  pluginId?: string;
  error?: Error;
  progress?: DocumentSnapshot['progress'];
}
