import type { StylePolicy } from '@fivo/dom';
import type { OfficeFileViewerWarning } from '../engine/previewWarnings';
import type { LayoutScheduler } from '../layout/LayoutScheduler';
import type { OfficeInteractionPort } from '../runtime/interactionTypes';
import type { ObservableState } from '../services/ObservableState';
import type { OfficeAnnotationService } from '../services/OfficeAnnotationService';
import type { OfficeFontService } from '../services/OfficeFontService';
import type { OfficeLinkService } from '../services/OfficeLinkService';
import type { OfficeNavigationService } from '../services/OfficeNavigationService';
import type { OfficeResourceService } from '../services/OfficeResourceService';
import type { OfficeSearchService } from '../services/OfficeSearchService';
import type { OfficeViewportService } from '../services/OfficeViewportService';

/** 渲染器实际消费的服务合同，避免基础 view 类型依赖服务组装函数。 */
export interface OfficeViewServices {
  state: OfficeInteractionPort;
  search: OfficeSearchService;
  annotations: OfficeAnnotationService;
  fonts: OfficeFontService;
  links: OfficeLinkService;
  resources: OfficeResourceService;
  navigation: OfficeNavigationService;
  layout: LayoutScheduler;
  viewport: OfficeViewportService;
  warnings: ObservableState<{
    items: readonly OfficeFileViewerWarning[];
  }>;
  reportWarning(warning: OfficeFileViewerWarning): void;
  setActive(active: boolean): void;
  dispose(): void | Promise<void>;
}

/** 渲染器只得到所属容器、服务与取消信号，不依赖框架实例。 */
export interface OfficeRenderContext {
  document: Document;
  container: HTMLElement;
  services: OfficeViewServices;
  signal: AbortSignal;
  locale?: 'zh-CN' | 'en-US';
  stylePolicy?: StylePolicy;
  isActive?(): boolean;
  onActiveChange?(listener: (active: boolean) => void): () => void;
  onError(error: unknown): void;
}

export interface ElementView<T> {
  update(value: T): void | Promise<void>;
  setActive(active: boolean): void;
  dispose(): void | Promise<void>;
}
