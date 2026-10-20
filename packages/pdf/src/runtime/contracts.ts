export interface PdfPageMetrics {
  width: number;
  height: number;
  rotation: number;
}
export interface PdfTextPage {
  text: string;
  runs: readonly { start: number; end: number; rect: readonly number[] }[];
}
export interface PdfOutlineEntry {
  id: string;
  title: string;
  pageIndex: number;
  children: readonly PdfOutlineEntry[];
  /** PDF 原始用户空间坐标；缺省时按整页书签处理，不伪造页内精度。 */
  destination?: PdfOutlineDestination;
}
export interface PdfOutlineDestination {
  left?: number;
  top?: number;
}
/** 阅读位置独立于工具栏刷新；interaction 标识用户主动打断目录定位。 */
export interface PdfReadingPosition {
  pageIndex: number;
  ratio: number;
  rotation: number;
  interaction: number;
}
export interface PdfLayerLease {
  dispose(): Promise<void>;
}
export interface PdfRenderJob {
  promise: Promise<void>;
  cancel(): void;
}
export interface PdfBackend {
  readonly pageCount: number;
  getMetrics(pageIndex: number, signal: AbortSignal): Promise<PdfPageMetrics>;
  render(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    options: { scale: number; rotation: number; signal: AbortSignal },
  ): PdfRenderJob;
  readText(pageIndex: number, signal: AbortSignal): Promise<PdfTextPage>;
  mountLayers(
    pageIndex: number,
    host: HTMLElement,
    options: {
      scale: number;
      rotation: number;
      signal: AbortSignal;
      onNavigate(pageIndex: number): void;
      onExternalLink(url: string): void;
    },
  ): Promise<PdfLayerLease>;
  readOutline(signal: AbortSignal): Promise<readonly PdfOutlineEntry[]>;
  getOutlineOffset?(
    pageIndex: number,
    destination: PdfOutlineDestination,
    rotation: number,
    signal: AbortSignal,
  ): Promise<number | undefined>;
  cleanupPage(pageIndex: number): Promise<void>;
  dispose(): Promise<void>;
}
