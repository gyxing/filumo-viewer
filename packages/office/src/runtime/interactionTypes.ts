export type OfficeFamily = 'word' | 'spreadsheet' | 'presentation';
/** 自适应模式持续跟随视口，手动指定比例时退出。 */
export type OfficeZoomMode = 'percentage' | 'fit-width' | 'fit-page';
export type OfficeRevisionMode = 'final' | 'markup' | 'original';
export type OfficeTarget =
  | { kind: 'page' | 'slide'; index: number }
  | { kind: 'sheet'; sheetId: string };
/** Office 专属命令只存在于插件边界，不进入通用 Core。 */
export type OfficeCommandRequest =
  | { type: 'navigate'; target: OfficeTarget; animate?: boolean }
  | { type: 'zoom'; value: number }
  | { type: 'zoomMode'; mode: OfficeZoomMode }
  | { type: 'outline' | 'notes' | 'review'; open: boolean }
  | {
      type: 'search';
      open?: boolean;
      query?: string;
      direction?: 'next' | 'previous';
    }
  | { type: 'revision'; mode: OfficeRevisionMode }
  | { type: 'sheetMode'; mode: 'source' | 'reading' }
  | { type: 'gridCopy' | 'gridResetColumns' }
  | { type: 'transitions'; enabled: boolean };
export interface OfficeInteractionState {
  readonly family: OfficeFamily;
  readonly ready: boolean;
  readonly active: boolean;
  readonly activeIndex: number;
  readonly activeSheetId?: string;
  readonly pageIndex: number;
  readonly slideCount: number;
  readonly pageCount: number;
  readonly sheets: readonly { id: string; name: string }[];
  readonly zoom: number;
  readonly zoomMode: OfficeZoomMode;
  readonly showOutline: boolean;
  readonly showNotes: boolean;
  readonly showSearch: boolean;
  readonly showReview: boolean;
  readonly revisionMode: OfficeRevisionMode;
  readonly sheetMode: 'source' | 'reading';
  readonly gridReady?: boolean;
  readonly columnWidthsChanged?: boolean;
  readonly transitions: boolean;
  readonly transitionIntent?: {
    token: number;
    targetIndex: number;
    direction: 'previous' | 'next';
  };
  readonly query: string;
  readonly resultCount: number;
  readonly resultIndex: number;
  readonly searching: boolean;
  readonly annotationCount: number;
  readonly outlineCount: number;
  readonly noteCount: number;
  readonly revisionCount: number;
  readonly supportsRevisionModes: boolean;
}
export interface OfficeDocumentInfo {
  outlineCount?: number;
  slideCount?: number;
  pageCount?: number;
  pageIndex?: number;
  sheets?: readonly { id: string; name: string }[];
}
export interface OfficeInteractionHandlers {
  setQuery?(query: string): void;
  nextResult?(): Promise<unknown>;
  previousResult?(): Promise<unknown>;
  navigatePage?(index: number): void | Promise<void>;
}
export interface OfficeInteractionPort {
  getState(): OfficeInteractionState;
  subscribe(listener: () => void): () => void;
  execute(command: OfficeCommandRequest): Promise<void>;
  /** 仅接受当前自适应模式的测量，避免旧视图回调覆盖手动缩放。 */
  updateFitZoom(mode: OfficeZoomMode, zoom: number): void;
  updateDocument(info: OfficeDocumentInfo): void;
  updateSearch(info: {
    query: string;
    resultCount: number;
    resultIndex: number;
    searching: boolean;
  }): void;
  updateAnnotations(
    count: number,
    info?: {
      noteCount?: number;
      revisionCount?: number;
      supportsRevisionModes?: boolean;
    },
  ): void;
  bind(handlers: OfficeInteractionHandlers): () => void;
  /** 网格操作与搜索绑定独立，切表释放不会覆盖公共处理器。 */
  bindGrid?(handlers: {
    copySelection(): Promise<void>;
    resetColumns(): void;
  }): () => void;
  updateGrid?(info: { columnWidthsChanged: boolean }): void;
  setActive(active: boolean): void;
  dispose(): void;
}
