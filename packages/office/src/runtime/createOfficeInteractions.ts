import { FivoError, notify } from '@fivo/core';
import {
  OFFICE_DEFAULT_ZOOM,
  OFFICE_MAX_ZOOM,
  OFFICE_MIN_ZOOM,
} from './constants';
import type {
  OfficeCommandRequest,
  OfficeDocumentInfo,
  OfficeInteractionHandlers,
  OfficeInteractionPort,
  OfficeInteractionState,
} from './interactionTypes';

/** 建立单一交互状态源；旧 React 控制器仅通过绑定端口提供真实操作。 */
export function createOfficeInteractions(kind: string): OfficeInteractionPort {
  const family =
    kind === 'doc' || kind === 'docx'
      ? 'word'
      : kind === 'xls' || kind === 'xlsx'
      ? 'spreadsheet'
      : 'presentation';
  let state: OfficeInteractionState = Object.freeze({
    family,
    ready: false,
    active: true,
    activeIndex: 0,
    pageIndex: 0,
    slideCount: 0,
    pageCount: 0,
    sheets: [],
    zoom: OFFICE_DEFAULT_ZOOM,
    zoomMode: 'percentage',
    showOutline: false,
    showNotes: false,
    showSearch: false,
    showReview: false,
    revisionMode: 'final',
    sheetMode: 'source',
    transitions: false,
    query: '',
    resultCount: 0,
    resultIndex: -1,
    searching: false,
    annotationCount: 0,
    outlineCount: 0,
    noteCount: 0,
    revisionCount: 0,
    supportsRevisionModes: false,
  });
  let handlers: OfficeInteractionHandlers | undefined;
  let closed = false;
  let transitionToken = 0;
  const listeners = new Set<() => void>();
  // 外部统计不能将无穷值或负数传播到工具栏内容条件。
  const normalizeCount = (value: number) => {
    if (!Number.isFinite(value))
      throw new FivoError('INVALID_COUNT', '内容数量必须是有限数值');
    return Math.max(0, Math.trunc(value));
  };
  const update = (change: Partial<OfficeInteractionState>) => {
    if (
      closed ||
      Object.entries(change).every(
        ([key, value]) => state[key as keyof OfficeInteractionState] === value,
      )
    )
      return;
    state = Object.freeze({ ...state, ...change });
    notify(listeners);
  };
  const requireFamily = (expected: OfficeInteractionState['family']) => {
    if (family !== expected)
      throw new FivoError('UNSUPPORTED_COMMAND', '此格式不支持该操作');
  };
  const requireHandler = <T>(handler: T | undefined): T => {
    if (!handler || !state.active)
      throw new FivoError('COMMAND_NOT_READY', '文档操作尚未就绪');
    return handler;
  };
  const validateIndex = (index: number, count: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= count)
      throw new FivoError('INVALID_TARGET', '导航目标超出范围');
  };
  return {
    getState: () => state,
    subscribe(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async execute(command: OfficeCommandRequest) {
      if (closed) throw new FivoError('OFFICE_DISPOSED', 'Office 文档已释放');
      switch (command.type) {
        case 'zoom':
          if (
            !Number.isFinite(command.value) ||
            command.value < OFFICE_MIN_ZOOM ||
            command.value > OFFICE_MAX_ZOOM
          )
            throw new FivoError('INVALID_ZOOM', '缩放超出支持范围');
          update({ zoom: command.value, zoomMode: 'percentage' });
          return;
        case 'zoomMode':
          if (!['percentage', 'fit-width', 'fit-page'].includes(command.mode))
            throw new FivoError('INVALID_ZOOM_MODE', '缩放模式无效');
          // 表格通常是长画布，只提供适合宽度，避免误导为整张表适合页面。
          if (family === 'spreadsheet' && command.mode === 'fit-page')
            throw new FivoError('UNSUPPORTED_COMMAND', '表格不支持适合页面');
          update({ zoomMode: command.mode });
          return;
        case 'outline':
          requireFamily('word');
          update({
            showOutline: command.open,
            ...(command.open ? { showSearch: false } : {}),
          });
          return;
        case 'notes':
          requireFamily('presentation');
          update({ showNotes: command.open });
          return;
        case 'review':
          update({ showReview: command.open });
          return;
        case 'revision':
          requireFamily('word');
          if (!['final', 'markup', 'original'].includes(command.mode))
            throw new FivoError('INVALID_REVISION_MODE', '修订显示模式无效');
          update({ revisionMode: command.mode });
          return;
        case 'sheetMode':
          requireFamily('spreadsheet');
          if (!['source', 'reading'].includes(command.mode))
            throw new FivoError('INVALID_SHEET_MODE', '表格显示模式无效');
          update({ sheetMode: command.mode });
          return;
        case 'transitions':
          requireFamily('presentation');
          update({ transitions: command.enabled });
          return;
        case 'navigate':
          if (command.target.kind === 'slide') {
            requireFamily('presentation');
            validateIndex(command.target.index, state.slideCount);
            update({
              activeIndex: command.target.index,
              transitionIntent:
                command.animate &&
                state.transitions &&
                command.target.index !== state.activeIndex
                  ? {
                      token: ++transitionToken,
                      targetIndex: command.target.index,
                      direction:
                        command.target.index > state.activeIndex
                          ? 'next'
                          : 'previous',
                    }
                  : undefined,
            });
          } else if (command.target.kind === 'sheet') {
            requireFamily('spreadsheet');
            const sheetId = command.target.sheetId;
            if (!state.sheets.some((sheet) => sheet.id === sheetId))
              throw new FivoError('INVALID_TARGET', '工作表不存在');
            update({ activeSheetId: command.target.sheetId });
          } else {
            requireFamily('word');
            validateIndex(command.target.index, state.pageCount);
            await requireHandler(handlers?.navigatePage)(command.target.index);
            if (!closed) update({ pageIndex: command.target.index });
          }
          return;
        case 'search': {
          const setQuery =
            command.query !== undefined
              ? requireHandler(handlers?.setQuery)
              : undefined;
          if (command.query !== undefined && typeof command.query !== 'string')
            throw new FivoError('INVALID_QUERY', '查询必须为文本');
          update({
            showSearch: command.open ?? true,
            ...(command.open ?? true ? { showOutline: false } : {}),
          });
          if (setQuery) setQuery(command.query!);
          if (command.direction === 'next')
            await requireHandler(handlers?.nextResult)();
          else if (command.direction === 'previous')
            await requireHandler(handlers?.previousResult)();
          return;
        }
        default:
          throw new FivoError('UNSUPPORTED_COMMAND', '未知 Office 操作');
      }
    },
    updateFitZoom(mode, zoom) {
      // 隐藏、卸载或切换模式后的测量不能改写当前显示状态。
      if (
        !state.active ||
        !state.ready ||
        mode === 'percentage' ||
        state.zoomMode !== mode ||
        !Number.isFinite(zoom) ||
        zoom < OFFICE_MIN_ZOOM ||
        zoom > OFFICE_MAX_ZOOM
      )
        return;
      update({ zoom });
    },
    updateDocument(info: OfficeDocumentInfo) {
      const change: Partial<OfficeInteractionState> = {};
      if (info.outlineCount !== undefined)
        Object.assign(change, {
          outlineCount: normalizeCount(info.outlineCount),
        });
      if (info.slideCount !== undefined)
        Object.assign(change, {
          slideCount: Math.max(0, info.slideCount),
          activeIndex: Math.min(
            state.activeIndex,
            Math.max(0, info.slideCount - 1),
          ),
        });
      if (info.pageCount !== undefined)
        Object.assign(change, {
          pageCount: Math.max(0, info.pageCount),
          pageIndex: Math.min(
            info.pageIndex ?? state.pageIndex,
            Math.max(0, info.pageCount - 1),
          ),
        });
      if (
        info.sheets &&
        JSON.stringify(info.sheets) !== JSON.stringify(state.sheets)
      ) {
        const sheets = Object.freeze(
          info.sheets.map((sheet) =>
            Object.freeze({ id: sheet.id, name: sheet.name }),
          ),
        );
        Object.assign(change, {
          sheets,
          activeSheetId: sheets.some(
            (sheet) => sheet.id === state.activeSheetId,
          )
            ? state.activeSheetId
            : sheets[0]?.id,
        });
      }
      update(change);
    },
    updateSearch: update,
    updateAnnotations(count, info) {
      update({
        annotationCount: normalizeCount(count),
        noteCount: normalizeCount(info?.noteCount ?? 0),
        revisionCount: normalizeCount(info?.revisionCount ?? 0),
        supportsRevisionModes: info?.supportsRevisionModes ?? false,
      });
    },
    bind(next) {
      if (closed) throw new FivoError('OFFICE_DISPOSED', 'Office 文档已释放');
      handlers = next;
      update({ ready: true });
      return () => {
        if (handlers === next) {
          handlers = undefined;
          update({ ready: false });
        }
      };
    },
    setActive(active) {
      update({ active });
    },
    dispose() {
      if (closed) return;
      closed = true;
      handlers = undefined;
      listeners.clear();
    },
  };
}
