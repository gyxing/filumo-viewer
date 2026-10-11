/** 格式无关的输入读取限制；格式插件可以扩展自己的限制。 */
export interface ResourcePolicy {
  maxFileBytes?: number;
  timeoutMs?: number;
}
export interface DocumentSource {
  readonly name?: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly url?: string;
  readAll(signal: AbortSignal): Promise<Uint8Array>;
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
  load(): Promise<DocumentDriver<T>>;
}
export interface ControllerSnapshot {
  status: DocumentStatus;
  session?: DocumentSession;
  pluginId?: string;
  error?: Error;
  progress?: DocumentSnapshot['progress'];
}
