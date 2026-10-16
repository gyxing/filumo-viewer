import { enUS } from '../../locale/en-US';
import { zhCN } from '../../locale/zh-CN';
import type { OfficeViewServices } from '../../view/contracts';
import { createOfficeIcon, setOfficeIconButton } from '../../view/ui';
import { mountSidebarResize } from './SidebarResize';
import { fillPanelEntry, fillReviewEntry, panelLocation } from './panelContent';
// 行高包括卡片间距，滚动窗口与选中项定位使用同一尺寸。
const SEARCH_ROW_HEIGHT = 72;
const REVIEW_ROW_HEIGHT = 116;
/** 原生侧栏只消费服务快照，结果列表使用窗口化 DOM，完整文本保留在详情和标题中。 */
export function mountNativePanels(
  searchHost: HTMLElement,
  reviewHost: HTMLElement,
  services: OfficeViewServices,
  onError: (error: unknown) => void,
) {
  const doc = searchHost.ownerDocument;
  let locale: 'zh-CN' | 'en-US' = 'zh-CN';
  let closed = false;
  let searchVisible = false;
  let reviewIndex = -1;
  searchHost.classList.add('fivo-native-search');
  reviewHost.classList.add('fivo-native-review');
  const searchTitle = doc.createElement('button'),
    query = doc.createElement('input'),
    position = doc.createElement('span'),
    resultStatus = doc.createElement('div'),
    searchList = doc.createElement('div'),
    searchCanvas = doc.createElement('div');
  searchList.className = 'fivo-native-list';
  searchCanvas.className = 'fivo-native-list-canvas';
  searchList.append(searchCanvas);
  query.type = 'search';
  query.oninput = () => services.search.actions.setQuery(query.value);
  query.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void (
        event.shiftKey
          ? services.search.actions.previousResult()
          : services.search.actions.nextResult()
      ).catch(onError);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      void services.state.execute({ type: 'search', open: false });
    }
  };
  const makeButton = (host: HTMLElement, run: () => void) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.onclick = run;
    host.append(button);
    return button;
  };
  const header = doc.createElement('header');
  const tabs = doc.createElement('div');
  tabs.className = 'fivo-native-navigation-tabs';
  const outlineTab = makeButton(tabs, () => {
    void services.state.execute({ type: 'outline', open: true });
  });
  outlineTab.className = 'fivo-native-tab';
  searchTitle.type = 'button';
  searchTitle.className = 'fivo-native-tab fivo-native-tab--active';
  searchTitle.setAttribute('aria-pressed', 'true');
  position.className = 'fivo-native-search-position';
  position.setAttribute('role', 'status');
  tabs.append(searchTitle);
  header.append(tabs);
  const closeSearch = makeButton(header, () => {
    void services.state.execute({ type: 'search', open: false });
  });
  const row = doc.createElement('div');
  row.className = 'fivo-native-query';
  const field = doc.createElement('div');
  field.className = 'fivo-native-query-field';
  field.append(createOfficeIcon(doc, 'search'), query);
  const clear = makeButton(field, () => {
    services.search.actions.setQuery('');
    query.focus();
  });
  row.append(field);
  const searchNavigation = doc.createElement('div');
  searchNavigation.className = 'fivo-native-search-navigation';
  searchNavigation.append(position);
  const previous = makeButton(searchNavigation, () => {
    void services.search.actions.previousResult().catch(onError);
  });
  const next = makeButton(searchNavigation, () => {
    void services.search.actions.nextResult().catch(onError);
  });
  const toggles = doc.createElement('div');
  toggles.className = 'fivo-native-query-options';
  resultStatus.className = 'fivo-native-result-status';
  const matchLabel = doc.createElement('label'),
    wholeLabel = doc.createElement('label'),
    match = doc.createElement('input'),
    whole = doc.createElement('input'),
    matchText = doc.createTextNode(''),
    wholeText = doc.createTextNode('');
  match.type = whole.type = 'checkbox';
  match.onchange = () => services.search.actions.setMatchCase(match.checked);
  whole.onchange = () => services.search.actions.setWholeWord(whole.checked);
  matchLabel.append(match, matchText);
  wholeLabel.append(whole, wholeText);
  toggles.append(matchLabel, wholeLabel);
  resultStatus.setAttribute('role', 'status');
  const empty = doc.createElement('div');
  empty.className = 'fivo-native-search-empty';
  searchHost.append(
    header,
    row,
    toggles,
    searchNavigation,
    resultStatus,
    empty,
    searchList,
  );
  const reviewHeader = doc.createElement('header'),
    reviewTitle = doc.createElement('strong');
  reviewHeader.append(reviewTitle);
  const previousReview = makeButton(reviewHeader, () => {
    void services.annotations.actions.previous().catch(onError);
  });
  const nextReview = makeButton(reviewHeader, () => {
    void services.annotations.actions.next().catch(onError);
  });
  const closeReview = makeButton(reviewHeader, () => {
    void services.state.execute({ type: 'review', open: false });
  });
  const reviewList = doc.createElement('div'),
    reviewCanvas = doc.createElement('div'),
    reviewSummary = doc.createElement('div'),
    reviewEmpty = doc.createElement('div'),
    detail = doc.createElement('div');
  reviewList.className = 'fivo-native-list fivo-native-review-list';
  reviewCanvas.className = 'fivo-native-list-canvas';
  detail.className = 'fivo-native-review-detail';
  reviewSummary.className = 'fivo-native-review-summary';
  reviewEmpty.className = 'fivo-native-review-empty';
  reviewEmpty.setAttribute('role', 'status');
  reviewList.append(reviewCanvas);
  reviewHost.append(reviewHeader, reviewSummary, reviewEmpty, reviewList, detail);
  const renderSearch = () => {
    if (closed) return;
    const state = services.search.getSnapshot();
    const messages = locale === 'en-US' ? enUS : zhCN;
    searchTitle.textContent = locale === 'en-US' ? 'Find' : '查找';
    outlineTab.textContent = locale === 'en-US' ? 'Outline' : '大纲';
    outlineTab.hidden = services.state.getState().family !== 'word';
    setOfficeIconButton(
      closeSearch,
      locale === 'en-US' ? 'Close' : '关闭',
      services.state.getState().family === 'word' ? 'panelLeftClose' : 'close',
    );
    setOfficeIconButton(
      closeReview,
      locale === 'en-US' ? 'Close' : '关闭',
      'close',
    );
    setOfficeIconButton(
      clear,
      locale === 'en-US' ? 'Clear search' : '清空查找',
      'close',
    );
    clear.hidden = !state.query;
    query.placeholder = messages.search.placeholder;
    query.setAttribute('aria-label', messages.search.placeholder);
    if (query.value !== state.query) query.value = state.query;
    match.checked = state.matchCase;
    whole.checked = state.wholeWord;
    matchText.textContent = messages.search.matchCase;
    wholeText.textContent = messages.search.wholeWord;
    previous.disabled = next.disabled = !state.results.length;
    setOfficeIconButton(previous, messages.search.previous, 'up');
    setOfficeIconButton(next, messages.search.next, 'down');
    // 未选择结果时显示总数，避免 0 / N 被误解为未找到内容。
    position.textContent =
      state.currentIndex < 0
        ? messages.search.resultCount(state.results.length)
        : messages.search.currentResult(
            state.currentIndex + 1,
            state.results.length,
          );
    searchNavigation.hidden = !state.results.length;
    resultStatus.textContent =
      state.error ??
      (state.searching
        ? (locale === 'en-US' ? 'Searching ' : '正在查找 ') +
          state.scanned +
          '/' +
          state.total
        : '');
    resultStatus.hidden = !resultStatus.textContent;
    resultStatus.dataset.state = state.error ? 'error' : 'loading';
    resultStatus.setAttribute('role', state.error ? 'alert' : 'status');
    empty.hidden = !!state.results.length || state.searching || !!state.error;
    empty.textContent = state.query.trim()
      ? messages.search.noResults
      : messages.search.emptyQuery;
    searchList.hidden = !state.results.length;
    searchList.setAttribute('aria-busy', String(state.searching));
    const height = SEARCH_ROW_HEIGHT,
      start = Math.max(0, Math.floor(searchList.scrollTop / height) - 2),
      end = Math.min(
        state.results.length,
        start + Math.ceil((searchList.clientHeight || 400) / height) + 4,
      );
    searchCanvas.style.height = state.results.length * height + 'px';
    const focused = searchList.contains(doc.activeElement)
      ? (doc.activeElement as HTMLElement).dataset.resultId
      : undefined;
    searchCanvas.replaceChildren();
    for (let index = start; index < end; index++) {
      const result = state.results[index];
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'fivo-native-result';
      button.style.top = index * height + 'px';
      button.style.height = height - 4 + 'px';
      const target = result.target;
      const sheet =
        target.kind === 'spreadsheet'
          ? services.state
              .getState()
              .sheets.find((item) => item.id === target.sheetId)?.name
          : undefined;
      fillPanelEntry(
        button,
        panelLocation(target, locale === 'en-US', sheet),
        result.previewText,
        undefined,
        {
          text: state.query,
          matchCase: state.matchCase,
          wholeWord: state.wholeWord,
        },
      );
      button.title = result.previewText;
      button.dataset.resultId = result.id;
      button.setAttribute('aria-pressed', String(index === state.currentIndex));
      button.onclick = () => {
        void services.search.actions.selectResult(index).catch(onError);
      };
      searchCanvas.append(button);
      if (focused === result.id) button.focus({ preventScroll: true });
    }
  };
  const renderReview = () => {
    if (closed || reviewHost.hidden) return;
    const state = services.annotations.getSnapshot();
    const messages = locale === 'en-US' ? enUS : zhCN;
    setOfficeIconButton(previousReview, messages.review.previous, 'up');
    setOfficeIconButton(nextReview, messages.review.next, 'down');
    setOfficeIconButton(closeReview, messages.review.close, 'close');
    previousReview.disabled = nextReview.disabled = !state.snapshot.count;
    if (state.activeIndex !== reviewIndex) {
      reviewIndex = state.activeIndex;
      if (reviewIndex >= 0)
        reviewList.scrollTop = Math.max(
          0,
          reviewIndex * REVIEW_ROW_HEIGHT - reviewList.clientHeight / 2,
        );
    }
    reviewTitle.textContent =
      (locale === 'en-US' ? 'Comments' : '批注') +
      ' (' +
      state.snapshot.count +
      ')';
    reviewSummary.textContent = messages.review.noteCount(
      state.snapshot.noteCount,
    );
    reviewSummary.hidden = !state.snapshot.noteCount;
    reviewEmpty.textContent = messages.review.empty;
    reviewEmpty.hidden = !!state.snapshot.count || !!state.error;
    reviewList.hidden = !state.snapshot.count;
    reviewList.setAttribute('aria-label', messages.review.comments);
    reviewList.setAttribute('aria-busy', String(state.loading));
    const height = REVIEW_ROW_HEIGHT,
      start = Math.max(0, Math.floor(reviewList.scrollTop / height) - 2),
      end = Math.min(
        state.snapshot.count,
        start + Math.ceil((reviewList.clientHeight || 400) / height) + 4,
      );
    reviewCanvas.style.height = state.snapshot.count * height + 'px';
    const focused = reviewList.contains(doc.activeElement)
      ? (doc.activeElement as HTMLElement).dataset.annotationIndex
      : undefined;
    reviewCanvas.replaceChildren();
    for (let index = start; index < end; index++) {
      const item = services.annotations.actions.getCached(index);
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'fivo-native-result';
      button.style.top = index * height + 'px';
      button.style.height = height - 8 + 'px';
      const target = item?.target;
      const sheet =
        target?.kind === 'spreadsheet-cell'
          ? services.state
              .getState()
              .sheets.find((sheet) => sheet.id === target.sheetId)?.name
          : undefined;
      fillReviewEntry(
        button,
        target ? panelLocation(target, locale === 'en-US', sheet) : '',
        item,
        locale,
        messages.review,
      );
      button.title = item?.text ?? '';
      button.dataset.annotationIndex = String(index);
      button.setAttribute('aria-pressed', String(state.activeIndex === index));
      button.onclick = () => {
        void services.annotations.actions.selectIndex(index).catch(onError);
      };
      reviewCanvas.append(button);
      if (focused === String(index)) button.focus({ preventScroll: true });
    }
    detail.textContent = state.error ?? state.activeAnnotation?.text ?? '';
    detail.setAttribute('role', state.error ? 'alert' : 'region');
    detail.setAttribute('aria-label', messages.review.region);
    detail.dataset.state = state.error ? 'error' : 'content';
    detail.hidden = !detail.textContent;
    if (end > start && !state.loading && !state.error)
      void services.annotations.actions.loadRange(start, end).catch(onError);
  };
  const sync = () => {
    const state = services.state.getState();
    searchHost.hidden = !state.showSearch;
    reviewHost.hidden = !state.showReview;
    if (state.showSearch) renderSearch();
    if (state.showSearch && !searchVisible && state.active) {
      query.focus({ preventScroll: true });
      query.select();
    }
    searchVisible = state.showSearch;
    if (state.showReview) renderReview();
  };
  const stops = [
    services.search.subscribe(renderSearch),
    services.annotations.subscribe(renderReview),
    services.state.subscribe(sync),
  ];
  const searchResize = mountSidebarResize(
    searchHost,
    'right',
    services.layout,
    '调整查找侧栏宽度',
    renderSearch,
  );
  const reviewResize = mountSidebarResize(
    reviewHost,
    'left',
    services.layout,
    '调整批注侧栏宽度',
    renderReview,
  );
  stops.push(
    () => searchResize.dispose(),
    () => reviewResize.dispose(),
  );
  reviewList.onkeydown = (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      void (
        event.key === 'ArrowUp'
          ? services.annotations.actions.previous()
          : services.annotations.actions.next()
      ).catch(onError);
    }
  };
  searchList.onscroll = renderSearch;
  reviewList.onscroll = renderReview;
  sync();
  return {
    update(next: 'zh-CN' | 'en-US') {
      locale = next;
      searchResize.setLabel(
        locale === 'en-US' ? 'Resize search panel' : '调整查找侧栏宽度',
      );
      reviewResize.setLabel(
        locale === 'en-US' ? 'Resize comments panel' : '调整批注侧栏宽度',
      );
      renderSearch();
      renderReview();
      sync();
    },
    dispose() {
      closed = true;
      stops.forEach((stop) => stop());
      searchHost.replaceChildren();
      reviewHost.replaceChildren();
    },
  };
}
