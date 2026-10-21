import { abortError, notify } from './errors';
import type {
  DocumentSession,
  DocumentSnapshot,
  DocumentSource,
} from './types';

export interface SessionOptions<T> {
  id?: string;
  sessionId?: string;
  signal: AbortSignal;
  source: DocumentSource;
  format: string;
  data: T;
  partialReady?: boolean;
  dispose?(): void | Promise<void>;
}
export interface MutableDocumentSession<T> extends DocumentSession<T> {
  update(snapshot: Partial<DocumentSnapshot>): void;
}
let sequence = 0;
/** 创建不包含视图对象的会话，释放异常不会阻止来源清理。 */
export function createSession<T>(
  options: SessionOptions<T>,
): MutableDocumentSession<T> {
  const id =
    options.id ?? options.sessionId ?? 'filumo-' + Date.now() + '-' + ++sequence;
  const controller = new AbortController();
  const listeners = new Set<() => void>();
  let disposing: Promise<void> | undefined;
  let snapshot: DocumentSnapshot = {
    sessionId: id,
    format: options.format,
    status: 'ready',
    metadata: { name: options.source.name, size: options.source.size },
    partialReady: options.partialReady,
  };
  // 回调注册后才调用，此时所引用的节点/句柄已初始化。
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const onAbort = () => session.cancel(options.signal.reason);
  const session: MutableDocumentSession<T> = {
    id,
    signal: controller.signal,
    source: options.source,
    data: options.data,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(update) {
      if (disposing) return;
      snapshot = { ...snapshot, ...update };
      notify(listeners);
    },
    cancel(reason) {
      if (controller.signal.aborted) return;
      controller.abort(reason ?? abortError());
      snapshot = { ...snapshot, status: 'cancelled' };
      notify(listeners);
    },
    dispose() {
      if (disposing) return disposing;
      // 先发布清理 Promise，再触发观察者，避免同步重入执行两次清理。
      disposing = Promise.resolve().then(async () => {
        session.cancel();
        options.signal.removeEventListener('abort', onAbort);
        let error: unknown;
        try {
          await options.dispose?.();
        } catch (cause) {
          error = cause;
        }
        try {
          await options.source.dispose();
        } catch (cause) {
          error ??= cause;
        }
        snapshot = { ...snapshot, status: 'disposed' };
        notify(listeners);
        listeners.clear();
        if (error) throw error;
      });
      return disposing;
    },
  };
  options.signal.addEventListener('abort', onAbort, { once: true });
  if (options.signal.aborted) onAbort();
  return session;
}
