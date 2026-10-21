import { abortError, throwIfAborted } from '@filumo/core';
import { resolveOfficeFont } from '../engine/fonts/OfficeFontResolver';
import { createOfficeFontDiagnostics } from '../engine/fonts/fontDiagnostics';
import { createOfficeFontSourceSession } from '../engine/fonts/loadOfficeFontSources';
import type { OfficeFileViewerFontOptions } from '../engine/fonts/types';
import type { PreviewKind } from '../engine/preview';
import type { OfficeFileViewerWarning } from '../engine/previewWarnings';
import { ObservableState } from './ObservableState';
/** 字体资源与诊断的视图级所有者；不存在 React Hook 或全局 Document 假设。 */
export class OfficeFontService {
  private state = new ObservableState({
    ready: false,
    embeddedReady: false,
    revision: 0,
  });
  private controller = new AbortController();
  private releases: Array<() => void> = [];
  private aliases: Readonly<Record<string, string>> = {};
  private active = false;
  private diagnostics?: ReturnType<typeof createOfficeFontDiagnostics>;
  private pending: Promise<void>;
  private closed = false;
  getSnapshot = this.state.getSnapshot;
  subscribe = this.state.subscribe;
  constructor(
    private readonly config: {
      document?: Document;
      file?: File;
      kind?: PreviewKind;
      sessionId?: string;
      options?: OfficeFileViewerFontOptions;
      onWarning?: (warning: OfficeFileViewerWarning) => void;
    },
  ) {
    const { document, file, kind, options } = config;
    const warn = (warning: OfficeFileViewerWarning) => {
      if (!this.closed) {
        try {
          config.onWarning?.(warning);
        } catch {
          /* 观察者不拥有字体会话。 */
        }
      }
    };
    if (kind)
      this.diagnostics = createOfficeFontDiagnostics({
        sessionKey: config.sessionId,
        previewKind: kind,
        fontSet: document?.fonts,
        warnOnMissing: options?.warnOnMissing,
        onWarning: warn,
      });
    const jobs: Promise<unknown>[] = [];
    if (kind === 'docx' && file && document) {
      jobs.push(
        import('../engine/docx/loadDocxEmbeddedFonts')
          .then((module) =>
            module.loadDocxEmbeddedFonts(
              file,
              document,
              this.controller.signal,
            ),
          )
          .then(
            (session) => {
              if (this.closed) {
                session.dispose();
                return;
              }
              this.releases.push(() => session.dispose());
              this.aliases = session.aliases;
              this.state.update({ embeddedReady: true });
            },
            () => {
              if (!this.closed) this.state.update({ embeddedReady: true });
            },
          ),
      );
    } else this.state.update({ embeddedReady: true });
    if (options?.sources?.length && document) {
      const session = createOfficeFontSourceSession(options.sources, document);
      this.releases.push(() => session.dispose());
      jobs.push(
        session.ready.then((result) => {
          if (this.closed || !kind) return;
          for (const failure of result.failures)
            warn({
              code: 'FONT_SOURCE_LOAD_FAILED',
              message: '字体资源加载失败：' + failure.source.family,
              previewKind: kind,
              source: 'font',
              requestedFamily: failure.source.family,
              candidates: [failure.source.family],
            });
        }),
      );
    }
    this.pending = Promise.all(jobs).then(() => {
      if (this.closed) return;
      this.state.update({
        ready: true,
        revision: this.state.getSnapshot().revision + 1,
      });
      if (this.active) this.diagnostics?.activate();
    });
  }
  /** 等待字体加载或安全降级；取消只取消调用方等待，不破坏其他使用者。 */
  ready(signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (this.closed) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const cancel = () => reject(signal.reason ?? abortError());
      signal.addEventListener('abort', cancel, { once: true });
      this.controller.signal.addEventListener('abort', cancel, { once: true });
      this.pending
        .then(() => {
          if (this.closed) reject(abortError());
          else resolve();
        }, reject)
        .finally(() => {
          signal.removeEventListener('abort', cancel);
          this.controller.signal.removeEventListener('abort', cancel);
        });
    });
  }

  resolveFamily = (input?: string): string | undefined => {
    const value = resolveOfficeFont(input, this.config.options);
    const embedded = value.requestedFamily
      ? this.aliases[value.requestedFamily.toLocaleLowerCase()]
      : undefined;
    if (!embedded) this.diagnostics?.register(value);
    return (
      [embedded ? '"' + embedded + '"' : undefined, value.cssFamily]
        .filter(Boolean)
        .join(', ') || undefined
    );
  };
  setActive(active: boolean) {
    this.active = active;
    if (active && this.state.getSnapshot().ready) this.diagnostics?.activate();
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.controller.abort();
    this.diagnostics?.dispose();
    for (const release of this.releases.reverse()) release();
    this.releases = [];
    this.state.dispose();
  }
}
