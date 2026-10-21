import { abortError, throwIfAborted } from '@filumo/core';
import { PRESENTATION_PRELOAD_RADIUS } from '../../engine/presentation/presentationPerformance';
import type {
  PresentationSource,
  SlideModel,
  SpeakerNotesModel,
} from '../../engine/presentation/types';
import { ObservableState } from '../../services/ObservableState';
export interface SlideRequestState {
  index: number;
  loading: boolean;
  slide?: SlideModel;
  notes?: SpeakerNotesModel;
  error?: Error;
}
/** 单页请求拥有自己的取消代次和 Source 窗口租约，迟到结果不能覆盖当前页。 */
export class SlideRequestController {
  private state = new ObservableState<SlideRequestState>({
    index: -1,
    loading: false,
  });
  private generation = 0;
  private notesGeneration = 0;
  private request?: AbortController;
  private notesRequest?: AbortController;
  private release?: () => void;
  private closed = false;
  getSnapshot = this.state.getSnapshot;
  subscribe = this.state.subscribe;
  constructor(readonly source: PresentationSource) {}
  async select(index: number, signal?: AbortSignal): Promise<SlideModel> {
    if (this.closed) throw abortError();
    if (signal) throwIfAborted(signal);
    const count = this.source.getSnapshot().slideCount;
    if (!Number.isInteger(index) || index < 0 || index >= count)
      throw new RangeError('幻灯片索引超出范围');
    const generation = ++this.generation;
    this.request?.abort();
    this.notesRequest?.abort();
    this.notesGeneration++;
    this.release?.();
    const controller = new AbortController();
    this.request = controller;
    const abort = () => controller.abort(signal?.reason ?? abortError());
    signal?.addEventListener('abort', abort, { once: true });
    const start = Math.max(0, index - PRESENTATION_PRELOAD_RADIUS),
      end = Math.min(count - 1, index + PRESENTATION_PRELOAD_RADIUS);
    this.release = this.source.retainRange(start, end);
    this.state.update({
      index,
      slide:
        this.state.getSnapshot().index === index
          ? this.state.getSnapshot().slide
          : undefined,
      loading: true,
      error: undefined,
      notes: undefined,
    });
    void this.source.ensureRange(start, end, controller.signal).catch(() => {});
    try {
      const slide = await this.source.getSlide(index, controller.signal);
      throwIfAborted(controller.signal);
      if (this.closed || generation !== this.generation) throw abortError();
      this.state.update({ slide, loading: false });
      return slide;
    } catch (error) {
      if (
        !this.closed &&
        generation === this.generation &&
        !controller.signal.aborted
      )
        this.state.update({
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }
  async showNotes(visible: boolean) {
    const index = this.state.getSnapshot().index;
    const generation = ++this.notesGeneration;
    this.notesRequest?.abort();
    if (!visible || index < 0) {
      this.state.update({ notes: undefined });
      return;
    }
    const controller = new AbortController();
    this.notesRequest = controller;
    try {
      const notes = await this.source.getSpeakerNotes(index, controller.signal);
      if (
        !this.closed &&
        !controller.signal.aborted &&
        generation === this.notesGeneration
      )
        this.state.update({ notes });
    } catch {
      /* 备注读取失败不覆盖已显示的幻灯片。 */
    }
  }
  invalidate() {
    this.generation++;
    this.notesGeneration++;
    this.request?.abort();
    this.notesRequest?.abort();
    this.state.update({
      index: -1,
      slide: undefined,
      notes: undefined,
      loading: false,
      error: undefined,
    });
  }
  retry(signal?: AbortSignal) {
    const index = this.state.getSnapshot().index;
    this.source.retry(index);
    return this.select(index, signal);
  }
  setActive(active: boolean) {
    if (!active) {
      this.request?.abort();
      this.notesRequest?.abort();
      this.state.update({ loading: false });
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.notesGeneration++;
    this.request?.abort();
    this.notesRequest?.abort();
    this.release?.();
    this.release = undefined;
    this.state.dispose();
  }
}
