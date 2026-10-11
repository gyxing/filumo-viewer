import { createOfficeSearchSession } from '../engine/search/createOfficeSearchSession';
import { normalizeSearchText } from '../engine/search/normalizeSearchText';
import type {
  OfficeFileViewerSearchOptions,
  OfficeSearchProvider,
  OfficeSearchResult,
  OfficeSearchSession,
  OfficeSearchTarget,
} from '../engine/search/types';
import { ObservableState } from './ObservableState';
export type OfficeSearchNavigator = (
  target: OfficeSearchTarget,
) => boolean | Promise<boolean>;
export interface OfficeSearchState {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  results: readonly OfficeSearchResult[];
  currentIndex: number;
  scanned: number;
  total: number;
  searching: boolean;
  complete: boolean;
  error?: string;
}
/** 管理真实搜索提供器与查询版本；渲染层只注册定位器和读取快照。 */
export function createOfficeSearchService(
  options: OfficeFileViewerSearchOptions & { delayMs?: number } = {},
) {
  const state = new ObservableState<OfficeSearchState>({
    query: '',
    matchCase: !!options.matchCase,
    wholeWord: !!options.wholeWord,
    results: [],
    currentIndex: -1,
    scanned: 0,
    total: 0,
    searching: false,
    complete: true,
  });
  let provider: OfficeSearchProvider | undefined;
  let session: OfficeSearchSession | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0;
  let navigation = 0;
  let enabled = true,
    visible = false,
    closed = false;
  const navigators = new Map<
    OfficeSearchTarget['kind'],
    OfficeSearchNavigator
  >();
  const cancel = () => {
    revision++;
    navigation++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    session?.cancel();
  };
  const refresh = () => {
    cancel();
    if (closed) return;
    const current = state.getSnapshot();
    if (!enabled || !visible || !session) {
      state.update({ searching: false });
      return;
    }
    const query = {
      text: current.query,
      matchCase: current.matchCase,
      wholeWord: current.wholeWord,
    };
    if (!normalizeSearchText(query.text, query.matchCase).text) {
      state.update({
        results: [],
        currentIndex: -1,
        scanned: 0,
        total: 0,
        searching: false,
        complete: true,
        error: undefined,
      });
      return;
    }
    const token = revision;
    state.update({
      results: [],
      currentIndex: -1,
      scanned: 0,
      total: 0,
      searching: true,
      complete: false,
      error: undefined,
    });
    timer = setTimeout(() => {
      timer = undefined;
      void session!
        .search(query, (batch) => {
          if (closed || token !== revision) return;
          state.update({
            results: Object.freeze([
              ...state.getSnapshot().results,
              ...batch.items,
            ]),
            scanned: batch.scanned,
            total: batch.total,
            complete: batch.complete,
            searching: !batch.complete,
          });
        })
        .catch((error) => {
          if (!closed && token === revision)
            state.update({
              searching: false,
              complete: true,
              error: error instanceof Error ? error.message : String(error),
            });
        });
    }, options.delayMs ?? 120);
  };
  const selectResult = async (index: number) => {
    if (closed || !enabled || !Number.isFinite(index)) return false;
    const current = state.getSnapshot();
    if (!current.results.length) return false;
    const normalized =
      ((Math.trunc(index) % current.results.length) + current.results.length) %
      current.results.length;
    const result = current.results[normalized];
    const navigate = navigators.get(result.target.kind);
    if (!navigate) return false;
    const token = ++navigation;
    const queryRevision = revision;
    const navigated = await navigate(result.target);
    if (
      closed ||
      !navigated ||
      token !== navigation ||
      queryRevision !== revision
    )
      return false;
    state.update({ currentIndex: normalized });
    return true;
  };
  const actions = {
    setQuery(value: string) {
      if (value === state.getSnapshot().query) return;
      state.update({ query: value });
      refresh();
    },
    setMatchCase(value: boolean) {
      if (value === state.getSnapshot().matchCase) return;
      state.update({ matchCase: value });
      refresh();
    },
    setWholeWord(value: boolean) {
      if (value === state.getSnapshot().wholeWord) return;
      state.update({ wholeWord: value });
      refresh();
    },
    async navigateTarget(target: OfficeSearchTarget) {
      if (closed || !enabled) return false;
      const navigate = navigators.get(target.kind);
      if (!navigate) return false;
      const token = ++navigation;
      return Boolean(await navigate(target)) && !closed && token === navigation;
    },
    selectResult,
    previousResult: () =>
      selectResult(
        state.getSnapshot().currentIndex <= 0
          ? state.getSnapshot().results.length - 1
          : state.getSnapshot().currentIndex - 1,
      ),
    nextResult: () =>
      selectResult(
        state.getSnapshot().currentIndex < 0
          ? 0
          : state.getSnapshot().currentIndex + 1,
      ),
    registerProvider(next: OfficeSearchProvider) {
      if (closed) return () => {};
      cancel();
      session?.dispose();
      provider = next;
      session = createOfficeSearchSession(next);
      refresh();
      return () => {
        if (provider === next) {
          cancel();
          session?.dispose();
          session = undefined;
          provider = undefined;
          state.update({ searching: false });
        }
      };
    },
    registerNavigator(
      kind: OfficeSearchTarget['kind'],
      navigate: OfficeSearchNavigator,
    ) {
      if (closed) return () => {};
      navigators.set(kind, navigate);
      return () => {
        if (navigators.get(kind) === navigate) navigators.delete(kind);
      };
    },
  };
  return {
    getSnapshot: state.getSnapshot,
    subscribe: state.subscribe,
    actions,
    configure(next: { enabled: boolean; visible: boolean }) {
      if (enabled === next.enabled && visible === next.visible) return;
      enabled = next.enabled;
      visible = next.visible;
      refresh();
    },
    dispose() {
      if (closed) return;
      closed = true;
      cancel();
      session?.dispose();
      session = undefined;
      provider = undefined;
      navigators.clear();
      state.dispose();
    },
  };
}
export type OfficeSearchService = ReturnType<typeof createOfficeSearchService>;
