import { abortError, FilumoError, notify, throwIfAborted } from './errors';
import { waitForSource } from './guardSource';
import { normalizeSource, validatePolicy } from './source';
import type {
  ControllerSnapshot,
  DocumentInput,
  DocumentOpenOptions,
  DocumentPlugin,
  DocumentSession,
  DocumentSource,
  ResourcePolicy,
} from './types';

export interface ControllerOptions {
  plugins: readonly DocumentPlugin[];
  baseUrl?: string;
  pluginId?: string;
  resourcePolicy?: ResourcePolicy;
}
/** 管理单实例加载代次，保证旧异步结果不能覆盖新文档。 */
export function createDocumentController(options: ControllerOptions) {
  validatePolicy(options.resourcePolicy);
  const ids = new Set<string>();
  for (const plugin of options.plugins) {
    if (ids.has(plugin.id))
      throw new FilumoError('DUPLICATE_PLUGIN', '插件 ID 重复：' + plugin.id);
    if (plugin.protocolVersion !== 1)
      throw new FilumoError('PROTOCOL_MISMATCH', '插件协议不兼容');
    ids.add(plugin.id);
  }
  const plugins = [...options.plugins].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  );
  let generation = 0;
  let activeAbort: AbortController | undefined;
  let current: DocumentSession | undefined;
  let unsubscribe: (() => void) | undefined;
  let disposed = false;
  let snapshot: ControllerSnapshot = { status: 'idle' };
  const listeners = new Set<() => void>();
  const update = (next: ControllerSnapshot) => {
    snapshot = next;
    notify(listeners);
  };
  const releaseCurrent = async () => {
    unsubscribe?.();
    unsubscribe = undefined;
    const old = current;
    current = undefined;
    if (old) await old.dispose();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async open(
      input: DocumentInput,
      selection: DocumentOpenOptions = {},
    ): Promise<void> {
      if (disposed) throw new FilumoError('VIEWER_DISPOSED', '查看器已释放');
      const task = ++generation;
      activeAbort?.abort(abortError());
      const abort = new AbortController();
      activeAbort = abort;
      update({ status: 'detecting' });
      let latestProgress: ControllerSnapshot['progress'];
      let source: DocumentSource | undefined;
      let session: DocumentSession | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (options.resourcePolicy?.timeoutMs)
        timer = setTimeout(
          () => abort.abort(new FilumoError('LOAD_TIMEOUT', '文档加载超时')),
          options.resourcePolicy.timeoutMs,
        );
      try {
        await releaseCurrent();
        throwIfAborted(abort.signal);
        const preparing = normalizeSource(input, options);
        void preparing
          .then((value) => {
            if (abort.signal.aborted || generation !== task || disposed)
              return value.dispose();
          })
          .catch(() => undefined);
        source = await waitForSource(preparing, abort.signal);
        throwIfAborted(abort.signal);
        const currentSource = source;
        const metadata = () =>
          JSON.stringify([currentSource.name, currentSource.mimeType]);
        let detectedMetadata = '';
        const detectRegular = async () => {
          detectedMetadata = metadata();
          const extension = currentSource.name
            ?.toLowerCase()
            .match(/\.[^.]+$/)?.[0];
          const candidates = plugins.filter(
            (plugin) =>
              (extension && plugin.extensions.includes(extension)) ||
              (currentSource.mimeType &&
                plugin.mimeTypes.includes(
                  currentSource.mimeType.split(';')[0],
                )),
          );
          // 元数据仅用于排序，未知名称仍允许已注册描述符探测，不提前加载驱动。
          for (const candidate of [
            ...candidates,
            ...plugins.filter((plugin) => !candidates.includes(plugin)),
          ]) {
            const matched = await waitForSource(
              candidate.detect(currentSource, abort.signal),
              abort.signal,
            );
            throwIfAborted(abort.signal);
            if (generation !== task || disposed) throw abortError();
            if (matched) return candidate;
          }
          return undefined;
        };
        const pluginId = selection.pluginId ?? options.pluginId;
        let selected = pluginId
          ? plugins.find((plugin) => plugin.id === pluginId)
          : undefined;
        if (pluginId && !selected)
          throw new FilumoError('UNKNOWN_PLUGIN', '未注册的插件：' + pluginId);
        if (!selected) selected = await detectRegular();
        // 读取后才可能获得远程 MIME；元数据变化时先给专用插件重新判断的机会。
        if (!selected && !pluginId && metadata() !== detectedMetadata)
          selected = await detectRegular();
        // 兜底必须晚于所有常规探测；显式选择插件和已匹配驱动的错误均不进入此阶段。
        if (!selected && !pluginId)
          for (const candidate of plugins) {
            if (!candidate.detectFallback) continue;
            const matched = await waitForSource(
              candidate.detectFallback(
                source,
                abort.signal,
                options.resourcePolicy,
              ),
              abort.signal,
            );
            throwIfAborted(abort.signal);
            if (generation !== task || disposed) throw abortError();
            if (metadata() !== detectedMetadata) {
              selected = await detectRegular();
              if (selected) break;
            }
            if (matched) {
              selected = candidate;
              break;
            }
          }
        if (!selected)
          throw new FilumoError(
            'UNSUPPORTED_FORMAT',
            '没有已注册的插件可以预览此文件',
          );
        update({ status: 'loading', pluginId: selected.id });
        const driver = await waitForSource(selected.load(), abort.signal);
        throwIfAborted(abort.signal);
        const opening = driver.open(source, {
          sessionId: 'filumo-' + Date.now() + '-' + task,
          signal: abort.signal,
          resourcePolicy: options.resourcePolicy,
          resources: selection.resources,
          reportProgress(progress) {
            latestProgress = progress;
            if (generation === task && !disposed)
              update({ ...snapshot, progress });
          },
        });
        // 即使第三方驱动忽略取消，调用方也立即结束等待，迟到会话仍有唯一清理者。
        void opening
          .then((value) => {
            if (abort.signal.aborted || generation !== task || disposed)
              return value.dispose();
          })
          .catch(() => undefined);
        session = await waitForSource(opening, abort.signal);
        if (generation !== task || disposed || abort.signal.aborted)
          throw abortError();
        current = session;
        update({
          status: 'ready',
          pluginId: selected.id,
          session,
          progress: latestProgress,
        });
        unsubscribe = session.subscribe(() => {
          if (generation === task && !disposed)
            update({
              ...snapshot,
              status: session!.getSnapshot().status,
              error: session!.getSnapshot().error,
            });
        });
      } catch (cause) {
        if (session && current !== session)
          await session.dispose().catch(() => undefined);
        else if (!session && source)
          await source.dispose().catch(() => undefined);
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (generation === task && !disposed)
          update({
            // 超时属于加载失败，只有主动取消才展示取消状态。
            status:
              abort.signal.aborted &&
              !(
                abort.signal.reason instanceof FilumoError &&
                abort.signal.reason.code === 'LOAD_TIMEOUT'
              )
                ? 'cancelled'
                : 'error',
            error,
          });
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    async destroy(): Promise<void> {
      if (disposed) return;
      disposed = true;
      generation++;
      activeAbort?.abort(abortError());
      try {
        await releaseCurrent();
      } finally {
        update({ status: 'disposed' });
        listeners.clear();
      }
    },
  };
}
export type DocumentController = ReturnType<typeof createDocumentController>;
