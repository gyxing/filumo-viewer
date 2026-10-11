import type { OfficeFileViewerPreviewState } from '../engine/parsing/internalTypes';
import type { OfficeInteractionPort } from './interactionTypes';
/** 内部预览保持原模型，不向通用 Core 泄漏 Office 类型。 */
export interface OfficeRuntimeData {
  options?: import('../options').OfficeOptions;
  file: File;
  interactions: OfficeInteractionPort;
  preview: OfficeFileViewerPreviewState;
}
