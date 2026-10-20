/** 固定发行版本的内部适配合同，不从公开入口或宿主声明暴露。 */
export interface EngineViewport {
  width: number;
  height: number;
  scale: number;
  rotation: number;
  userUnit?: number;
  viewBox?: readonly number[];
  convertToViewportPoint(x: number, y: number): number[];
}
export interface EngineTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}
export interface EngineText {
  items: Array<EngineTextItem | { type: string }>;
  styles: Record<string, unknown>;
}
export interface EnginePage {
  rotate: number;
  getViewport(options: { scale: number; rotation?: number }): EngineViewport;
  render(options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: EngineViewport;
    background: string;
  }): { promise: Promise<void>; cancel(): void };
  getTextContent(): Promise<EngineText>;
  getAnnotations(options: {
    intent: string;
  }): Promise<
    Array<{ subtype?: string; url?: string; dest?: unknown; rect?: number[] }>
  >;
  cleanup(): boolean;
}
export interface EngineOutline {
  title: string;
  dest?: unknown;
  items?: EngineOutline[];
}
export interface EngineDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<EnginePage>;
  getOutline(): Promise<EngineOutline[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  destroy(): Promise<void>;
}
export interface EngineRangeTransport {
  requestDataRange(begin: number, end: number): void;
  onDataRange(begin: number, data: Uint8Array): void;
  transportReady(
    listener: (event: {
      type: 'range' | 'progressiveRead' | 'progressiveDone';
      begin?: number;
      chunk?: Uint8Array;
    }) => void,
  ): void;
  abort(): void;
}
export interface EngineLoadingTask {
  promise: Promise<EngineDocument>;
  onPassword?: (
    updatePassword: (password: string) => void,
    reason: number,
  ) => void;
  onProgress?: (progress: { loaded: number; total?: number }) => void;
  destroy(): Promise<void>;
}
export interface PdfEngine {
  version: string;
  PDFWorker: new (options: { port: Worker }) => { destroy(): void };
  PDFDataRangeTransport: new (
    length: number,
    initial: Uint8Array,
    progressiveDone?: boolean,
  ) => EngineRangeTransport;
  TextLayer: new (options: {
    textContentSource: EngineText;
    container: HTMLElement;
    viewport: EngineViewport;
  }) => { render(): Promise<void>; cancel(): void };
  getDocument(options: Record<string, unknown>): EngineLoadingTask;
}
