import type { DocumentSession } from '@filumo/core';
import { abortError, notify } from '@filumo/core';
import type {
  SpreadsheetSource,
  SpreadsheetSourceSnapshot,
} from '../../engine/spreadsheet/SpreadsheetSource';
import type { SpreadsheetRange } from '../../engine/spreadsheet/types';
/** 在渐进工作簿 Source 替换时转移订阅，视图不拥有源文件的销毁权。 */
export class SpreadsheetSourceBinding implements SpreadsheetSource {
  private current: SpreadsheetSource;
  private snapshot: SpreadsheetSourceSnapshot;
  private revision = 0;
  private listeners = new Set<() => void>();
  private stopSource: () => void;
  private stopSession: () => void;
  private closed = false;
  constructor(session: DocumentSession, resolve: () => SpreadsheetSource) {
    this.current = resolve();
    this.snapshot = {
      ...this.current.getSnapshot(),
      revision: ++this.revision,
    };
    this.stopSource = this.current.subscribe(this.refresh);
    this.stopSession = session.subscribe(() => {
      const next = resolve();
      if (next !== this.current) {
        this.stopSource();
        this.current = next;
        this.stopSource = next.subscribe(this.refresh);
        this.refresh();
      }
    });
  }
  get identity() {
    return this.current;
  }
  get searchProvider() {
    return this.current.searchProvider;
  }
  getSnapshot = () => this.snapshot;
  private refresh = () => {
    if (this.closed) return;
    this.snapshot = {
      ...this.current.getSnapshot(),
      revision: ++this.revision,
    };
    notify(this.listeners);
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getProfile(id: string) {
    return this.current.getProfile(id);
  }
  getSheetLayout(id: string) {
    return this.current.getSheetLayout(id);
  }
  async ensureSheet(id: string, signal?: AbortSignal) {
    const source = this.current;
    await source.ensureSheet(id, signal);
    if (this.closed || source !== this.current) throw abortError();
  }
  async getMaterializedSheet(id: string, signal?: AbortSignal) {
    const source = this.current;
    const value = await source.getMaterializedSheet(id, signal);
    if (this.closed || source !== this.current) throw abortError();
    return value;
  }
  async getAnnotations(id: string, signal?: AbortSignal) {
    const source = this.current;
    const value = await source.getAnnotations(id, signal);
    if (this.closed || source !== this.current) throw abortError();
    return value;
  }
  async getRange(id: string, range: SpreadsheetRange, signal?: AbortSignal) {
    const source = this.current;
    const value = await source.getRange(id, range, signal);
    if (this.closed || source !== this.current) throw abortError();
    return value;
  }
  retainRange(id: string, range: SpreadsheetRange) {
    return this.current.retainRange(id, range);
  }
  retrySheet(id: string) {
    this.current.retrySheet(id);
  }
  async dispose() {
    this.closed = true;
    this.stopSource();
    this.stopSession();
    this.listeners.clear();
  }
}
