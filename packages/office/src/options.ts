import type {
  OfficeFontOptions,
  OfficeHyperlinkActivateEvent,
  OfficeWarning,
} from './publicTypes';
/** 原生音视频保留外部资源默认禁止的策略。 */
export interface OfficeMediaOptions {
  allowExternal?: boolean;
  download?: boolean;
}
/** Office 专属解析选项不进入通用 Core；解析与原生视图均不依赖宿主框架。 */
export interface OfficeOptions {
  fonts?: OfficeFontOptions;
  media?: false | OfficeMediaOptions;
  onWarning?(warning: OfficeWarning): void;
  onHyperlinkActivate?(event: OfficeHyperlinkActivateEvent): void;
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => Worker;
  resourcePolicy?: {
    maxFileBytes?: number;
    timeoutMs?: number;
    maxArchiveEntries?: number;
    maxArchiveEntryBytes?: number;
    maxArchiveInflatedBytes?: number;
    maxCompressionRatio?: number;
  };
}
