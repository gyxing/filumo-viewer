import { useStyles as acquireStyles } from '@fivo/dom';
import { STYLE_SCOPE } from '../generated/package';
import { findTextMatches } from '../reader/findTextMatches';
import type { TextDocument, TextMatch } from '../reader/types';
import { TextFindBar } from './TextFindBar';
import { TextViewport } from './TextViewport';
import './text.less';
import type { TextSurfaceHandle, TextSurfaceOptions } from './types';

/** 挂载可独立消费的原文视图，只有该入口持有文本样式租约。 */
export function mountTextSurface(
  container: HTMLElement,
  initial: TextDocument,
  initialOptions: TextSurfaceOptions = {},
): TextSurfaceHandle {
  const document = container.ownerDocument;
  const release = acquireStyles('text', document, initialOptions.stylePolicy);
  const scope = document.createElement('div');
  scope.className = STYLE_SCOPE! + ' fivo-text-scope';
  const host = document.createElement('section');
  host.className = 'fivo-text-surface';
  scope.append(host);
  container.append(scope);
  let model = initial,
    options = initialOptions,
    closed = false,
    matches: TextMatch[] = [],
    index = -1;
  let searchAbort = new AbortController();
  let noMatches = false;
  const viewport = new TextViewport(model, options, document);
  const bar = new TextFindBar(
    document,
    options.locale === 'en-US',
    () => {
      void search();
    },
    move,
    () => searchAbort.abort(),
  );
  function move(delta: number) {
    if (!matches.length) return;
    index = (index + delta + matches.length) % matches.length;
    viewport.highlight(matches, index);
    viewport.goTo(matches[index].start);
    bar.status.textContent = index + 1 + ' / ' + matches.length;
  }
  async function search() {
    searchAbort.abort();
    const controller = (searchAbort = new AbortController());
    matches = [];
    noMatches = false;
    index = -1;
    viewport.highlight([], -1);
    bar.status.textContent = '';
    try {
      for await (const batch of findTextMatches(
        model,
        bar.query.value,
        { matchCase: bar.matchCase.checked, wholeWord: bar.wholeWord.checked },
        controller.signal,
      )) {
        if (closed || controller.signal.aborted) return;
        matches.push(...batch);
        bar.status.textContent = String(matches.length);
      }
      if (closed || controller.signal.aborted) return;
      if (matches.length) move(1);
      else if (bar.query.value) {
        noMatches = true;
        bar.status.textContent =
          options.locale === 'en-US' ? 'No matches' : '未找到';
      }
    } catch (error) {
      if (!controller.signal.aborted && !closed)
        bar.status.textContent = String(error);
    }
  }
  const watermark = document.createElement('div');
  watermark.className = 'fivo-text-watermark';
  watermark.textContent = options.watermark ?? '';
  watermark.setAttribute('aria-hidden', 'true');
  host.append(bar.element, viewport.element, watermark);
  host.onkeydown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      bar.element.hidden = false;
      bar.query.focus();
    }
    if (event.key === 'Escape') {
      bar.element.hidden = true;
      searchAbort.abort();
      viewport.element.focus();
    }
  };
  return {
    update(next, nextOptions) {
      const changed = model !== next;
      model = next;
      options = nextOptions;
      bar.updateLocale(options.locale === 'en-US');
      if (noMatches)
        bar.status.textContent = options.locale === 'en-US' ? 'No matches' : '未找到';
      viewport.update(model, options);
      watermark.textContent = options.watermark ?? '';
      if (changed && bar.query.value) void search();
    },
    setActive(active) {
      viewport.setActive(active);
      if (!active) searchAbort.abort();
    },
    showSearch(open) {
      bar.element.hidden = !open;
      if (open) bar.query.focus();
      else searchAbort.abort();
    },
    getPosition() {
      return viewport.getPosition();
    },
    restorePosition(position) {
      viewport.restorePosition(position);
    },
    revealRange(range) {
      viewport.revealRange(range);
    },
    dispose() {
      if (closed) return;
      closed = true;
      searchAbort.abort();
      viewport.dispose();
      scope.remove();
      release();
    },
  };
}
