import type { OfficeAnnotationSource } from '../engine/annotations/AnnotationSource';
import type {
  OfficeAnnotation,
  OfficeAnnotationSourceSnapshot,
  OfficeAnnotationTarget,
} from '../engine/annotations/types';
import type { WordRevisionRecord } from '../engine/word/review/types';
import { ObservableState } from './ObservableState';
export type OfficeAnnotationNavigator = (
  annotation: OfficeAnnotation,
) => boolean | Promise<boolean>;
export interface OfficeAnnotationState {
  snapshot: OfficeAnnotationSourceSnapshot;
  activeIndex: number;
  activeAnnotation?: OfficeAnnotation;
  activeRevision?: WordRevisionRecord;
  loading: boolean;
  error?: string;
  cacheRevision: number;
}
const EMPTY: OfficeAnnotationSourceSnapshot = Object.freeze({
  revision: 0,
  count: 0,
  revisionCount: 0,
  noteCount: 0,
  supportsRevisionModes: false,
});
/** 批注数据、窗口缓存、选择与修订状态由服务唯一持有，视图只注册精确定位器。 */
export function createOfficeAnnotationService() {
  const state = new ObservableState<OfficeAnnotationState>({
    snapshot: EMPTY,
    activeIndex: -1,
    loading: false,
    cacheRevision: 0,
  });
  const cache = new Map<number, OfficeAnnotation>();
  const navigators = new Map<
    OfficeAnnotationTarget['kind'],
    OfficeAnnotationNavigator
  >();
  let source: OfficeAnnotationSource | undefined;
  let unsubscribe: (() => void) | undefined;
  let read: AbortController | undefined;
  let readVersion = 0,
    selection = 0,
    revisionSelection = 0;
  let closed = false,
    enabled = true;
  let onActivate: (() => void) | undefined;
  const reset = () => {
    readVersion++;
    selection++;
    revisionSelection++;
    read?.abort();
    read = undefined;
    cache.clear();
    state.update({
      cacheRevision: state.getSnapshot().cacheRevision + 1,
      activeIndex: -1,
      activeAnnotation: undefined,
      activeRevision: undefined,
      loading: false,
      error: undefined,
    });
  };
  const sync = () => {
    const next = enabled ? source?.getSnapshot() ?? EMPTY : EMPTY;
    if (state.getSnapshot().snapshot.revision !== next.revision) reset();
    state.update({ snapshot: next });
  };
  const loadRange = async (start: number, end: number) => {
    const owner = source,
      snapshot = state.getSnapshot().snapshot;
    if (closed || !enabled || !owner || !snapshot.count) return;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const a = Math.min(snapshot.count, Math.max(0, Math.trunc(start))),
      b = Math.min(snapshot.count, Math.max(a, Math.trunc(end)));
    if (a >= b) return;
    let complete = true;
    for (let i = a; i < b; i++)
      if (!cache.has(i)) {
        complete = false;
        break;
      }
    if (complete) return;
    read?.abort();
    const controller = new AbortController();
    read = controller;
    const token = ++readVersion;
    state.update({ loading: true, error: undefined });
    try {
      const items = await owner.getRange(a, b, controller.signal);
      if (
        closed ||
        controller.signal.aborted ||
        token !== readVersion ||
        owner !== source ||
        snapshot.revision !== owner.getSnapshot().revision
      )
        return;
      items.forEach((item, index) => cache.set(a + index, item));
      state.update({ cacheRevision: state.getSnapshot().cacheRevision + 1 });
    } catch (error) {
      if (token === readVersion && !controller.signal.aborted && !closed)
        state.update({
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (token === readVersion && !closed) {
        read = undefined;
        state.update({ loading: false });
      }
    }
  };
  const selectIndex = async (requested: number) => {
    const owner = source;
    if (closed || !enabled || !owner || !Number.isFinite(requested))
      return false;
    const snapshot = state.getSnapshot().snapshot;
    if (!snapshot.count) return false;
    const index = Math.min(
        snapshot.count - 1,
        Math.max(0, Math.trunc(requested)),
      ),
      token = ++selection;
    await loadRange(index, index + 1);
    if (
      closed ||
      token !== selection ||
      owner !== source ||
      owner.getSnapshot().revision !== snapshot.revision
    )
      return false;
    const annotation = cache.get(index);
    if (!annotation) return false;
    const navigate = navigators.get(annotation.target.kind);
    const ok = navigate ? await navigate(annotation) : true;
    if (!ok || closed || token !== selection || owner !== source) return false;
    state.update({
      activeIndex: index,
      activeAnnotation: annotation,
      activeRevision: undefined,
    });
    try {
      onActivate?.();
    } catch {
      /* 外部回调不改变已完成选择。 */
    }
    return true;
  };
  const actions = {
    registerSource(next: OfficeAnnotationSource) {
      if (closed) return () => {};
      unsubscribe?.();
      reset();
      source = next;
      sync();
      unsubscribe = next.subscribe(sync);
      return () => {
        if (source === next) {
          unsubscribe?.();
          unsubscribe = undefined;
          source = undefined;
          reset();
          sync();
        }
      };
    },
    registerNavigator(
      kind: OfficeAnnotationTarget['kind'],
      navigate: OfficeAnnotationNavigator,
    ) {
      if (closed) return () => {};
      navigators.set(kind, navigate);
      return () => {
        if (navigators.get(kind) === navigate) navigators.delete(kind);
      };
    },
    loadRange,
    getCached: (index: number) => cache.get(index),
    selectIndex,
    async loadAnnotationsByIds(ids: readonly string[]) {
      const owner = source;
      if (closed || !owner || !ids.length) return [];
      const revision = owner.getSnapshot().revision;
      const unique = [...new Set(ids)];
      const indexes = await Promise.all(
        unique.map((id) => owner.findIndexById(id)),
      );
      if (
        closed ||
        source !== owner ||
        owner.getSnapshot().revision !== revision
      )
        return [];
      const valid = indexes.filter((index) => index >= 0);
      if (!valid.length) return [];
      await loadRange(Math.min(...valid), Math.max(...valid) + 1);
      if (
        closed ||
        source !== owner ||
        owner.getSnapshot().revision !== revision
      )
        return [];
      const found = new Map(
        valid.flatMap((index) => {
          const item = cache.get(index);
          return item ? [[item.id, item] as const] : [];
        }),
      );
      return unique.flatMap((id) => (found.get(id) ? [found.get(id)!] : []));
    },
    async selectId(id: string) {
      const owner = source;
      if (closed || !owner) return false;
      const version = owner.getSnapshot().revision;
      const index = await owner.findIndexById(id);
      return source !== owner ||
        closed ||
        owner.getSnapshot().revision !== version ||
        index < 0
        ? false
        : selectIndex(index);
    },
    previous() {
      const current = state.getSnapshot();
      return selectIndex(
        current.activeIndex <= 0
          ? current.snapshot.count - 1
          : current.activeIndex - 1,
      );
    },
    next() {
      const current = state.getSnapshot();
      return selectIndex(
        current.activeIndex < 0
          ? 0
          : (current.activeIndex + 1) % current.snapshot.count,
      );
    },
    async activateRevisionId(id: string) {
      const owner = source;
      if (closed || !owner?.findRevisionIndexById || !owner.getRevisionRange)
        return false;
      const version = owner.getSnapshot().revision,
        token = ++revisionSelection;
      const index = await owner.findRevisionIndexById(id);
      if (index < 0 || closed || owner !== source) return false;
      const [revision] = await owner.getRevisionRange(index, index + 1);
      if (
        !revision ||
        closed ||
        owner !== source ||
        token !== revisionSelection ||
        owner.getSnapshot().revision !== version
      )
        return false;
      state.update({
        activeRevision: revision,
        activeIndex: -1,
        activeAnnotation: undefined,
      });
      return true;
    },
    clearActiveRevision() {
      revisionSelection++;
      state.update({ activeRevision: undefined });
    },
  };
  return {
    getSnapshot: state.getSnapshot,
    subscribe: state.subscribe,
    actions,
    configure(next: { enabled: boolean; onActivate?: () => void }) {
      onActivate = next.onActivate;
      if (enabled !== next.enabled) {
        enabled = next.enabled;
        reset();
        sync();
      }
    },
    dispose() {
      if (closed) return;
      closed = true;
      unsubscribe?.();
      reset();
      navigators.clear();
      source = undefined;
      state.dispose();
    },
  };
}
export type OfficeAnnotationService = ReturnType<
  typeof createOfficeAnnotationService
>;
