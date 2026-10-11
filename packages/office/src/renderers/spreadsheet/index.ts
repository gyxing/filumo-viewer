import type { ViewContext, ViewHandle } from '@fivo/dom';
import { createMemoryOfficeAnnotationSource } from '../../engine/annotations/AnnotationSource';
import { getSpreadsheetSource } from '../../engine/spreadsheet/spreadsheetSourceRegistry';
import { enUS } from '../../locale/en-US';
import { zhCN } from '../../locale/zh-CN';
import type { OfficeRuntimeData } from '../../runtime/types';
import { mountChart } from '../../view/shared/mountChart';
import { mountWatermark } from '../../view/shared/mountWatermark';
import {
  mountNativeOffice,
  type NativeOfficeContext,
} from '../common/mountNativeOffice';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { SpreadsheetSourceBinding } from './SpreadsheetSourceBinding';
import { parseSpreadsheetCellReference } from './navigation';
import './styles/document.less';
/** XLS/XLSX 使用同一原生工作簿视图，保留 Source 的稀疏访问和原始下载边界。 */
export function mountSpreadsheet(context: ViewContext): Promise<ViewHandle> {
  return mountNativeOffice(context, mountWorkbook);
}
async function mountWorkbook(
  context: NativeOfficeContext,
): Promise<ViewHandle> {
  const data = context.session.data as OfficeRuntimeData;
  const resolve = () => {
    const preview = data.preview;
    if (preview.previewKind !== 'xls' && preview.previewKind !== 'xlsx')
      throw new Error('工作簿视图类型不匹配');
    return preview.mode === 'source'
      ? preview.source
      : getSpreadsheetSource(preview.model.workbook);
  };
  const source = new SpreadsheetSourceBinding(context.session, resolve);
  const services = context.services,
    port = services.state,
    doc = context.document,
    root = doc.createElement('div'),
    tabs = doc.createElement('div'),
    tabBar = doc.createElement('div'),
    rangeLabel = doc.createElement('span'),
    surface = doc.createElement('div'),
    status = doc.createElement('div');
  root.className = 'office-file-xlsx-viewer';
  root.dataset.officeRenderer = 'spreadsheet-dom';
  tabBar.className = 'office-file-xlsx-sheet-tabs';
  tabs.className = 'office-file-xlsx-sheet-tabs__list';
  rangeLabel.className = 'office-file-xlsx-sheet-tabs__range';
  tabBar.append(tabs, rangeLabel);
  tabs.setAttribute('role', 'tablist');
  surface.className = 'office-file-watermark-surface';
  status.setAttribute('role', 'status');
  root.append(tabBar, surface, status);
  context.stage.append(root);
  const watermark = mountWatermark(
    surface,
    context.options.watermark
      ? { content: context.options.watermark }
      : undefined,
  );
  const buttons = new Map<string, HTMLButtonElement>(),
    reading = new Map<string, Map<number, number>>();
  let currentId: string | undefined,
    closed = false,
    loading = false,
    mounted = false,
    generation = 0,
    parameters = '',
    promise: Promise<unknown> = Promise.resolve(),
    request: AbortController | undefined,
    grid: SpreadsheetGrid | undefined,
    chart: ReturnType<typeof mountChart> | undefined,
    chartInfo:
      | {
          chart: Parameters<typeof mountChart>[1]['chart'];
          width: number;
          height: number;
        }
      | undefined,
    stopSearch: (() => void) | undefined,
    stopAnnotations: (() => void) | undefined,
    identity = source.identity;
  const renderTabs = () => {
    const snapshot = source.getSnapshot(),
      active = port.getState().activeSheetId;
    let cursor = tabs.firstChild;
    for (const [index, sheet] of snapshot.sheets.entries()) {
      let button = buttons.get(sheet.id);
      if (!button) {
        button = doc.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.className = 'office-file-xlsx-sheet-tabs__tab';
        button.onclick = () => {
          void port.execute({
            type: 'navigate',
            target: { kind: 'sheet', sheetId: sheet.id },
          });
        };
        buttons.set(sheet.id, button);
      }
      button.textContent = sheet.name;
      button.title = sheet.name;
      button.dataset.officeSpreadsheetSheetId = sheet.id;
      button.setAttribute('aria-selected', String(sheet.id === active));
      button.tabIndex = sheet.id === active ? 0 : -1;
      button.onkeydown = (event) => {
        const target =
          event.key === 'ArrowRight'
            ? Math.min(snapshot.sheets.length - 1, index + 1)
            : event.key === 'ArrowLeft'
            ? Math.max(0, index - 1)
            : event.key === 'Home'
            ? 0
            : event.key === 'End'
            ? snapshot.sheets.length - 1
            : undefined;
        if (target !== undefined) {
          event.preventDefault();
          const id = snapshot.sheets[target].id;
          void port.execute({
            type: 'navigate',
            target: { kind: 'sheet', sheetId: id },
          });
          buttons.get(id)?.focus();
        }
      };
      if (button !== cursor) tabs.insertBefore(button, cursor);
      cursor = button.nextSibling;
    }
    for (const [id, button] of buttons)
      if (!snapshot.sheets.some((sheet) => sheet.id === id)) {
        button.remove();
        buttons.delete(id);
      }
    const activeSheet = snapshot.sheets.find((sheet) => sheet.id === active);
    rangeLabel.textContent = activeSheet
      ? (context.locale === 'en-US' ? enUS : zhCN).spreadsheet.dimensions(
          activeSheet.rowCount,
          activeSheet.columnCount,
        )
      : '';
    const button = active ? buttons.get(active) : undefined;
    if (button) {
      if (button.offsetLeft < tabs.scrollLeft)
        tabs.scrollLeft = button.offsetLeft;
      else if (
        button.offsetLeft + button.offsetWidth >
        tabs.scrollLeft + tabs.clientWidth
      )
        tabs.scrollLeft =
          button.offsetLeft + button.offsetWidth - tabs.clientWidth;
    }
  };
  const load = (id: string) => {
    const token = ++generation;
    currentId = id;
    mounted = false;
    loading = true;
    parameters = '';
    request?.abort();
    request = new AbortController();
    const signal = request.signal;
    grid?.dispose();
    grid = undefined;
    chart?.dispose();
    chart = undefined;
    chartInfo = undefined;
    stopAnnotations?.();
    stopAnnotations = undefined;
    status.textContent =
      context.locale === 'en-US' ? 'Loading sheet' : '正在读取工作表';
    promise = source
      .ensureSheet(id, signal)
      .then(async () => {
        if (closed || signal.aborted || token !== generation) return;
        const descriptor = source
          .getSnapshot()
          .sheets.find((sheet) => sheet.id === id);
        if (descriptor?.kind === 'chart') {
          const sheet = await source.getMaterializedSheet(id, signal);
          if (closed || signal.aborted || token !== generation) return;
          const item = sheet?.charts[0];
          if (item) {
            chartInfo = {
              chart: item.chart,
              width: item.width,
              height: item.height,
            };
            chart = mountChart(
              surface,
              { ...chartInfo, zoom: port.getState().zoom },
              context,
            );
          } else
            status.textContent =
              context.locale === 'en-US' ? 'No chart' : '没有可显示的图表';
        } else {
          let cache = reading.get(id);
          if (!cache) {
            cache = new Map();
            reading.set(id, cache);
          }
          grid = new SpreadsheetGrid(
            source,
            id,
            source.getSheetLayout(id),
            context,
            port.getState().zoom,
            port.getState().sheetMode,
            cache,
          );
          surface.prepend(grid.element);
        }
        loading = false;
        mounted = true;
        status.textContent = '';
        // 回调注册后才调用，此时所引用的节点/句柄已初始化。
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        sync();
        void source.getAnnotations(id, signal).then(
          (items) => {
            if (closed || signal.aborted || token !== generation) return;
            stopAnnotations?.();
            stopAnnotations = services.annotations.actions.registerSource(
              createMemoryOfficeAnnotationSource({
                annotations: items.map((item) => ({
                  id: item.id,
                  author: item.author,
                  createdAt: item.createdAt,
                  text: item.text,
                  resolved: item.resolved,
                  parentId: item.parentId,
                  target: {
                    kind: 'spreadsheet-cell' as const,
                    sheetId: id,
                    row: item.row,
                    column: item.column,
                  },
                })),
              }),
            );
          },
          () => {},
        );
      })
      .catch((error) => {
        if (closed || signal.aborted || token !== generation) return;
        loading = false;
        mounted = true;
        status.textContent = String(error);
        const retry = doc.createElement('button');
        retry.type = 'button';
        retry.textContent = context.locale === 'en-US' ? 'Retry' : '重试';
        retry.onclick = () => {
          source.retrySheet(id);
          currentId = undefined;
          // 回调注册后才调用，此时所引用的节点/句柄已初始化。
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          sync();
        };
        status.append(retry);
      });
  };
  const sync = () => {
    if (closed) return;
    renderTabs();
    const state = port.getState(),
      id = state.activeSheetId ?? source.getSnapshot().sheets[0]?.id;
    if (!id) {
      status.textContent =
        context.locale === 'en-US' ? 'No worksheets' : '没有可显示的工作表';
      return;
    }
    if (!state.active) return;
    if (id !== currentId || (!mounted && !loading)) {
      load(id);
      return;
    }
    if (grid) {
      const layout = source.getSheetLayout(id),
        key =
          id + ':' + state.zoom + ':' + state.sheetMode + ':' + layout.revision;
      if (key !== parameters) {
        parameters = key;
        grid.update(layout, state.zoom, state.sheetMode);
      }
    } else if (chart && chartInfo) {
      const key = id + ':' + state.zoom;
      if (key !== parameters) {
        parameters = key;
        void chart.update({ ...chartInfo, zoom: state.zoom });
      }
    }
  };
  const updateSource = () => {
    if (source.identity !== identity) {
      identity = source.identity;
      request?.abort();
      currentId = undefined;
      reading.clear();
      stopSearch?.();
      stopSearch = source.searchProvider
        ? services.search.actions.registerProvider(source.searchProvider)
        : undefined;
    }
    port.updateDocument({
      sheets: source
        .getSnapshot()
        .sheets.map((sheet) => ({ id: sheet.id, name: sheet.name })),
    });
    sync();
  };
  const stops = [
    port.subscribe(sync),
    source.subscribe(updateSource),
    services.search.subscribe(() => grid?.refresh()),
    services.annotations.subscribe(() => grid?.refresh()),
  ];
  if (source.searchProvider)
    stopSearch = services.search.actions.registerProvider(
      source.searchProvider,
    );
  const navigate = async (id: string, row: number, column: number) => {
    if (
      !source
        .getSnapshot()
        .sheets.some((sheet) => sheet.id === id && sheet.kind === 'worksheet')
    )
      return false;
    await port.execute({
      type: 'navigate',
      target: { kind: 'sheet', sheetId: id },
    });
    await promise;
    if (closed || currentId !== id) return false;
    return grid?.scrollToCell(row, column) ?? false;
  };
  stops.push(
    services.search.actions.registerNavigator('spreadsheet', (target) =>
      target.kind === 'spreadsheet'
        ? navigate(target.sheetId, target.rowIndex, target.columnIndex)
        : false,
    ),
  );
  stops.push(
    services.annotations.actions.registerNavigator(
      'spreadsheet-cell',
      (annotation) => {
        const target = annotation.target;
        return target.kind === 'spreadsheet-cell'
          ? navigate(target.sheetId, target.row, target.column)
          : false;
      },
    ),
  );
  stops.push(
    services.links.registerNavigator('spreadsheet', (target) => {
      if (target.family !== 'spreadsheet') return false;
      let name = target.sheetName,
        ref = target.cellRef;
      if (target.definedName) {
        const entry = Object.entries(
          source.getSnapshot().definedNames ?? {},
        ).find(
          ([key]) => key.toLowerCase() === target.definedName?.toLowerCase(),
        );
        if (!entry) return false;
        const value = entry[1].trim().replace(/^=/, ''),
          split = value.lastIndexOf('!');
        if (split < 0) return false;
        name = value.slice(0, split);
        if (name.startsWith("'") && name.endsWith("'"))
          name = name.slice(1, -1).replace(/''/g, "'");
        ref = value.slice(split + 1);
      }
      const position = ref ? parseSpreadsheetCellReference(ref) : undefined;
      if (!position) return false;
      const sheet = name
        ? source
            .getSnapshot()
            .sheets.find(
              (sheet) => sheet.name.toLowerCase() === name?.toLowerCase(),
            )
        : source.getSnapshot().sheets.find((sheet) => sheet.id === currentId) ??
          source.getSnapshot().sheets[0];
      return sheet
        ? navigate(sheet.id, position.rowIndex, position.columnIndex)
        : false;
    }),
  );
  updateSource();
  await promise;
  return {
    update(options) {
      context.options = options;
      context.locale = options.locale;
      watermark.update(
        options.watermark ? { content: options.watermark } : undefined,
      );
      sync();
    },
    setActive(active) {
      grid?.setActive(active);
      chart?.setActive(active);
      if (active) sync();
    },
    async dispose() {
      if (closed) return;
      closed = true;
      generation++;
      request?.abort();
      stops.forEach((stop) => stop());
      stopSearch?.();
      stopAnnotations?.();
      grid?.dispose();
      chart?.dispose();
      watermark.dispose();
      await source.dispose();
      root.remove();
    },
  };
}
