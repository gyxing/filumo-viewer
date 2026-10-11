import type { PreviewKind } from '../engine/preview';
import type { OfficeFileViewerWarning } from '../engine/previewWarnings';
import { classifyOfficeHyperlink } from '../shared/hyperlink/classifyOfficeHyperlink';
import type {
  OfficeHyperlinkActivateEvent,
  OfficeHyperlinkActivationRequest,
  OfficeHyperlinkNavigator,
  OfficeInternalHyperlinkTarget,
} from '../shared/hyperlink/types';
/** 链接分类、宿主拦截和文档内导航独立于菜单/触屏提示视图。 */
export class OfficeLinkService {
  private navigators = new Map<
    OfficeInternalHyperlinkTarget['family'],
    OfficeHyperlinkNavigator
  >();
  private closed = false;
  private generation = 0;
  constructor(
    private readonly config: {
      document: Document;
      file: File;
      kind: PreviewKind;
      sourceUrl?: string;
      onActivate?: (event: OfficeHyperlinkActivateEvent) => void;
      onWarning?: (warning: OfficeFileViewerWarning) => void;
    },
  ) {}
  registerNavigator = (
    family: OfficeInternalHyperlinkTarget['family'],
    navigator: OfficeHyperlinkNavigator,
  ) => {
    if (this.closed) return () => {};
    this.navigators.set(family, navigator);
    return () => {
      if (this.navigators.get(family) === navigator)
        this.navigators.delete(family);
    };
  };
  async open(
    request: OfficeHyperlinkActivationRequest,
    messages = {
      blocked: '已阻止不安全的文档链接',
      targetNotFound: '无法定位文档内部链接',
    },
  ): Promise<void> {
    if (this.closed) return;
    const generation = ++this.generation;
    let prevented = false;
    const event: OfficeHyperlinkActivateEvent = {
      hyperlink: request.hyperlink,
      file: this.config.file,
      previewKind: this.config.kind,
      sourceType: request.source.type,
      sourceId: request.source.id,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    };
    try {
      this.config.onActivate?.(event);
    } catch {
      /* 宿主异常不破坏链接服务。 */
    }
    if (prevented || this.closed) return;
    const target = classifyOfficeHyperlink(
      request.hyperlink,
      this.config.sourceUrl,
    );
    const warn = (code: string, message: string) => {
      if (this.closed || generation !== this.generation) return;
      try {
        this.config.onWarning?.({
          code,
          message,
          previewKind: this.config.kind,
          source: 'hyperlink',
        });
      } catch {
        /* 独立观察者。 */
      }
    };
    if (target.kind === 'host-only') return;
    if (target.kind === 'blocked') {
      warn('HYPERLINK_BLOCKED', messages.blocked);
      return;
    }
    const window = this.config.document.defaultView;
    if (target.kind === 'new-tab') {
      const url = new URL(target.target);
      url.username = '';
      url.password = '';
      const opened = window?.open(url.href, '_blank', 'noopener,noreferrer');
      if (opened) opened.opener = null;
      return;
    }
    if (target.kind === 'system') {
      window?.location.assign(target.target);
      return;
    }
    const navigator = this.navigators.get(target.target.family);
    try {
      if (!navigator || !(await navigator(target.target)))
        warn('HYPERLINK_TARGET_NOT_FOUND', messages.targetNotFound);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        warn('HYPERLINK_TARGET_NOT_FOUND', messages.targetNotFound);
    }
  }
  dispose() {
    this.closed = true;
    this.generation++;
    this.navigators.clear();
  }
}
