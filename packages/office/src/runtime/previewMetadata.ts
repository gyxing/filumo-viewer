import type { OfficeFileViewerPreviewState } from '../engine/parsing/internalTypes';
import type { OfficeDocumentInfo } from './interactionTypes';
/** 只读取现有摘要，不为工具栏重新解析或物化整个文档。 */
export function getOfficeDocumentInfo(
  preview: OfficeFileViewerPreviewState,
): OfficeDocumentInfo {
  if (preview.previewKind === 'ppt' || preview.previewKind === 'pptx')
    return {
      slideCount:
        preview.mode === 'source'
          ? preview.summary.slideCount
          : preview.model.document.slides.length,
    };
  if (preview.previewKind === 'xls' || preview.previewKind === 'xlsx')
    return {
      sheets: (preview.mode === 'source'
        ? preview.summary.sheets
        : preview.model.workbook.sheets
      ).map((sheet) => ({ id: sheet.id, name: sheet.name })),
    };
  return {};
}
