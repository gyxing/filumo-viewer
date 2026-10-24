import { createViewer, type ViewerHandle } from '../../../packages/dom/src';
import { office } from '../../../packages/office/src/descriptor';
const query = new URLSearchParams(location.search);
const id = query.get('sample')!;
const format = query.get('format')!;
const engine = query.get('engine')!;
const stage = document.getElementById('preview')!;
// UI 回归开启完整外壳，正文几何回归仍沿用原尺寸与无工具栏模式。
const ui = query.has('ui');
if (ui) stage.style.width = (Number(query.get('width')) || 1100) + 'px';
const result = document.getElementById('result')!;
let viewer: ViewerHandle | undefined;
let started = 0,
  readyMs = 0,
  error: unknown;
const longTasks: PerformanceEntry[] = [];
if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
  new PerformanceObserver((list) =>
    longTasks.push(...list.getEntries()),
  ).observe({ type: 'longtask', buffered: true });
const family = /ppt/.test(format)
  ? 'slides'
  : /xls/.test(format)
  ? 'sheet'
  : 'word';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const wordFrames = () =>
  Array.from(
    stage.querySelectorAll<HTMLElement>(
      '.office-file-doc-viewer__scroller .office-file-doc-page-frame, .office-file-docx-viewer__scroller .office-file-docx-page-frame',
    ),
  );
const visibleWord = () => {
  const top =
    stage
      .querySelector<HTMLElement>(
        '.office-file-doc-viewer__scroller, .office-file-docx-viewer__scroller',
      )
      ?.getBoundingClientRect().top ?? 0;
  return (
    wordFrames().find(
      (node) => node.getBoundingClientRect().bottom > top + 25,
    ) ?? wordFrames()[0]
  );
};
const content = () =>
  family === 'word'
    ? visibleWord()
    : family === 'slides'
    ? stage.querySelector<HTMLElement>(
        '.office-file-pptx-viewer__viewport .office-file-pptx-slide',
      )
    : stage.querySelector<HTMLElement>(
        '.office-file-xlsx-virtual-grid, .office-file-xlsx-sheet-grid',
      );
/** 空白补齐区属于辅助网格，正文对照仍严格比较真实单元格与原有行列标题。 */
function documentText(target: HTMLElement | undefined | null) {
  if (!target) return '';
  if (family !== 'sheet') return target.textContent ?? '';
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('[data-office-grid-filler]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    text += node.textContent ?? '';
  return text;
}
/** 仅从呈现内容采集对照，默认外壳的视觉另由 ui.spec.mjs 验证。 */
function snapshot() {
  const target = content();
  const rect = target?.getBoundingClientRect();
  const cells = Array.from(
    stage.querySelectorAll<HTMLElement>('[data-office-spreadsheet-cell]'),
  )
    .map((el) => ({
      ref: el.dataset.officeSpreadsheetCell,
      text: el.textContent?.replace(/\s+/g, ' ').trim(),
    }))
    .filter((cell) => cell.text)
    .sort((a, b) => String(a.ref).localeCompare(String(b.ref)));
  const navigationCount =
    family === 'sheet'
      ? viewer
          ?.getCapabilities()
          .actions?.find((action) => action.id === 'office.sheet')?.options
          ?.length ?? 0
      : viewer?.getCapabilities().navigation?.count ?? 0;
  const value = {
    id,
    format,
    engine,
    readyMs,
    navigationCount,
    navigationIndex: viewer?.getCapabilities().navigation?.index,
    scrollTop:
      stage.querySelector<HTMLElement>(
        '.office-file-doc-viewer__scroller, .office-file-docx-viewer__scroller',
      )?.scrollTop ?? 0,
    text: documentText(target).replace(/\s+/g, ' ').trim(),
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
    cells,
    images: target?.querySelectorAll('img').length ?? 0,
    tables: target?.querySelectorAll('table').length ?? 0,
    nodes: stage.querySelectorAll('*').length,
    pageCount: Number(
      stage.querySelector<HTMLElement>('[data-page-count]')?.dataset
        .pageCount ||
        stage.querySelectorAll(
          '.office-file-doc-page-frame, .office-file-docx-page-frame',
        ).length,
    ),
    longTaskCount: longTasks.filter((entry) => entry.startTime >= started)
      .length,
    longTaskMs: longTasks
      .filter((entry) => entry.startTime >= started)
      .reduce((sum, entry) => sum + entry.duration, 0),
    heapBytes: (performance as any).memory?.usedJSHeapSize ?? null,
  };
  result.textContent = JSON.stringify(value);
  return value;
}
async function dispose() {
  await viewer?.destroy();
  viewer = undefined;
}
document.getElementById('run')!.onclick = async () => {
  document.body.dataset.state = 'loading';
  error = undefined;
  readyMs = 0;
  try {
    await dispose();
    started = performance.now();
    viewer = createViewer(stage, {
      plugins: [office({ worker: 'never', media: ui })],
      height: ui ? 680 : 780,
      toolbar: ui,
      theme: query.get('theme') === 'dark' ? 'dark' : 'light',
      locale: query.get('locale') === 'en-US' ? 'en-US' : 'zh-CN',
      onError: (value) => {
        error = value;
      },
    });
    if (query.has('empty')) {
      document.body.dataset.state = 'idle';
      return;
    }
    const bytes = await (await fetch('/samples/' + id)).arrayBuffer();
    const file = new File([bytes], id + '.' + format);
    await viewer.open(file);
    // 几何参考固定使用 100%，避免演示文稿默认适应容器后把正确缩放误判为排版漂移。
    if (!ui) await viewer.getCapabilities().zoom?.set(100);
    let previous = '',
      stable = 0;
    for (let i = 0; i < 1200; i++) {
      if (error) throw error;
      const node = content();
      const text = node?.textContent ?? '';
      if (node && (text.trim() || node.querySelector('img,svg,canvas'))) {
        if (!readyMs) readyMs = performance.now() - started;
        stable = text === previous ? stable + 1 : 0;
        if (stable >= 5) break;
      }
      previous = text;
      await sleep(25);
    }
    if (!content()) throw Error('未生成格式内容节点');
    await document.fonts.ready;
    snapshot();
    document.body.dataset.state = 'ready';
  } catch (value) {
    result.textContent = String(value);
    document.body.dataset.state = 'error';
  }
};
document.getElementById('snapshot')!.onclick = () => {
  snapshot();
};
document.getElementById('next')!.onclick = async () => {
  document.body.dataset.state = 'navigating';
  try {
    if (family === 'sheet') {
      const action = viewer
        ?.getCapabilities()
        .actions?.find((item) => item.id === 'office.sheet');
      await action?.run(action.options?.[1]?.value);
    } else await viewer?.getCapabilities().navigation?.goTo(1);
    await sleep(200);
    snapshot();
    document.body.dataset.state = 'ready';
  } catch (error) {
    result.textContent = String(error);
    document.body.dataset.state = 'error';
  }
};
document.getElementById('destroy')!.onclick = async () => {
  await dispose();
  await sleep(50);
  result.textContent = JSON.stringify({
    remainingNodes: stage.children.length,
    styles: document.querySelectorAll('style[data-filumo-style]').length,
  });
  document.body.dataset.state = 'destroyed';
};
