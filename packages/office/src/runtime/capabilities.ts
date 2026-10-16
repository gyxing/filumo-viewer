import type { CapabilityAction, ViewerCapabilities } from '@fivo/dom';
import {
  OFFICE_MAX_ZOOM,
  OFFICE_MIN_ZOOM,
  OFFICE_ZOOM_LEVELS,
  OFFICE_ZOOM_STEP,
} from './constants';
import type {
  OfficeInteractionPort,
  OfficeRevisionMode,
  OfficeZoomMode,
} from './interactionTypes';

/** 将 Office 私有状态投影为通用能力，供默认工具栏或宿主自定义界面使用。 */
export function createOfficeCapabilities(
  port: OfficeInteractionPort,
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
): ViewerCapabilities {
  const state = port.getState();
  const en = locale === 'en-US';
  const enabled = state.ready && state.active;
  const actions: CapabilityAction[] = [
    {
      id: 'office.zoomMode',
      label: en ? 'Zoom mode' : '缩放模式',
      kind: 'select',
      toolbar: { visible: false },
      enabled,
      value: state.zoomMode,
      options: [
        { value: 'percentage', label: en ? 'Percentage' : '固定比例' },
        { value: 'fit-width', label: en ? 'Fit width' : '适合宽度' },
        ...(state.family === 'spreadsheet'
          ? []
          : [{ value: 'fit-page', label: en ? 'Fit page' : '适合页面' }]),
      ],
      run: (value) =>
        port.execute({ type: 'zoomMode', mode: value as OfficeZoomMode }),
    },
    {
      id: 'office.search',
      toolbar: { order: 30, placement: 'main' },
      label: en ? 'Find' : '查找',
      kind: 'toggle',
      enabled,
      pressed: state.showSearch,
      run: () =>
        port.execute({ type: 'search', open: !port.getState().showSearch }),
    },
  ];
  if (state.family === 'word') {
    actions.push({
      id: 'office.outline',
      toolbar: {
        visible: state.outlineCount > 0,
        order: 10,
        placement: 'main',
      },
      label: en ? 'Outline' : '大纲',
      kind: 'toggle',
      enabled,
      pressed: state.showOutline,
      run: () =>
        port.execute({ type: 'outline', open: !port.getState().showOutline }),
    });
    actions.push({
      id: 'office.revision',
      // 与旧版相同，存在批注时也允许切换文档修订投影。
      toolbar: {
        visible: state.supportsRevisionModes || state.annotationCount > 0,
        order: 20,
        placement: 'main',
        showLabel: false,
      },
      label: en ? 'Revisions' : '修订显示',
      kind: 'select',
      enabled,
      value: state.revisionMode,
      options: [
        { value: 'final', label: en ? 'Final' : '最终状态' },
        { value: 'markup', label: en ? 'Markup' : '显示修订' },
        { value: 'original', label: en ? 'Original' : '原始状态' },
      ],
      run: (value) =>
        port.execute({ type: 'revision', mode: value as OfficeRevisionMode }),
    });
  } else {
    actions.push({
      id: 'office.review',
      toolbar: {
        visible: state.annotationCount + state.noteCount > 0,
        order: 40,
        placement: 'main',
      },
      label: en ? 'Comments' : '批注',
      kind: 'toggle',
      enabled,
      pressed: state.showReview,
      run: () =>
        port.execute({ type: 'review', open: !port.getState().showReview }),
    });
  }
  if (state.family === 'spreadsheet') {
    actions.push({
      id: 'office.sheetMode',
      toolbar: { order: 10, placement: 'main', showLabel: false },
      label: en ? 'Table view' : '表格视图',
      kind: 'select',
      enabled,
      value: state.sheetMode,
      options: [
        { value: 'source', label: en ? 'Source' : '原始布局' },
        { value: 'reading', label: en ? 'Reading' : '阅读模式' },
      ],
      run: (value) =>
        port.execute({
          type: 'sheetMode',
          mode: value as 'source' | 'reading',
        }),
    });
    actions.push({
      id: 'office.sheet',
      toolbar: { visible: false },
      label: en ? 'Worksheet' : '工作表',
      kind: 'select',
      enabled: enabled && state.sheets.length > 0,
      value: state.activeSheetId,
      options: state.sheets.map((sheet) => ({
        value: sheet.id,
        label: sheet.name,
      })),
      run: (value) =>
        port.execute({
          type: 'navigate',
          target: { kind: 'sheet', sheetId: value ?? '' },
        }),
    });
  }
  if (state.family === 'presentation') {
    actions.push({
      id: 'office.notes',
      toolbar: { order: 20, placement: 'main' },
      label: en ? 'Notes' : '备注',
      kind: 'toggle',
      enabled,
      pressed: state.showNotes,
      run: () =>
        port.execute({ type: 'notes', open: !port.getState().showNotes }),
    });
    actions.push({
      id: 'office.transitions',
      // 保留宿主调用能力，默认工具栏及更多菜单均不展示转场开关。
      toolbar: { visible: false },
      label: en ? 'Transitions' : '切换效果',
      kind: 'toggle',
      enabled,
      pressed: state.transitions,
      run: () =>
        port.execute({
          type: 'transitions',
          enabled: !port.getState().transitions,
        }),
    });
  }
  const count =
    state.family === 'presentation'
      ? state.slideCount
      : state.family === 'word'
      ? state.pageCount
      : 0;
  const index =
    state.family === 'presentation' ? state.activeIndex : state.pageIndex;
  return {
    actions,
    zoom: {
      value: state.zoom,
      min: OFFICE_MIN_ZOOM,
      max: OFFICE_MAX_ZOOM,
      step: OFFICE_ZOOM_STEP,
      presets: OFFICE_ZOOM_LEVELS,
      mode: {
        value: state.zoomMode,
        options: [
          { value: 'fit-width', label: en ? 'Fit width' : '适应宽度' },
          ...(state.family === 'spreadsheet'
            ? []
            : [{ value: 'fit-page', label: en ? 'Fit page' : '适应页面' }]),
        ],
        set: (mode) =>
          port.execute({ type: 'zoomMode', mode: mode as OfficeZoomMode }),
      },
      toolbar: { order: 50, placement: 'main', priority: 100 },
      set: (value) => port.execute({ type: 'zoom', value }),
    },
    navigation:
      enabled && count > 0
        ? {
            toolbar: {
              visible: state.family === 'presentation',
              order: 10,
              placement: 'main',
              layout: 'buttons',
              previousLabel: en ? 'Previous slide' : '上一张幻灯片',
              nextLabel: en ? 'Next slide' : '下一张幻灯片',
            },
            index,
            count,
            goTo: (target) =>
              port.execute({
                type: 'navigate',
                target: {
                  kind: state.family === 'word' ? 'page' : 'slide',
                  index: target,
                },
                animate: true,
              }),
          }
        : undefined,
    search: enabled
      ? {
          query: state.query,
          resultCount: state.resultCount,
          currentIndex: state.resultIndex,
          searching: state.searching,
          setQuery: (query) => port.execute({ type: 'search', query }),
          next: () => port.execute({ type: 'search', direction: 'next' }),
          previous: () =>
            port.execute({ type: 'search', direction: 'previous' }),
        }
      : undefined,
  };
}
