import type { OfficeFileViewerPreviewState } from '../engine/parsing/internalTypes';
import type { OfficeFileViewerWarning } from '../engine/previewWarnings';
import {
  collectOfficeFileWarnings,
  collectOfficePreviewWarnings,
} from '../engine/previewWarnings';

/** 字体诊断可能重复回报，按来源、代码、内容及字体区分同一条提示。 */
function warningKey(warning: OfficeFileViewerWarning): string {
  return JSON.stringify([
    warning.source,
    warning.previewKind,
    warning.code,
    warning.message,
    warning.source === 'font' ? warning.requestedFamily : undefined,
  ]);
}

/** 合并非致命警告；没有新增内容时保持引用，避免诊断引起重复渲染。 */
export function mergeOfficeWarnings(
  current: readonly OfficeFileViewerWarning[],
  incoming: readonly OfficeFileViewerWarning[],
): readonly OfficeFileViewerWarning[] {
  const seen = new Set(current.map(warningKey));
  const additions = incoming.filter((warning) => {
    const key = warningKey(warning);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return additions.length ? [...current, ...additions] : current;
}

/** 从已有解析结果收集提示，不为提示重新读取或解析文件。 */
export function collectViewWarnings(
  preview: OfficeFileViewerPreviewState,
  fileName: string,
  runtimeWarnings: readonly OfficeFileViewerWarning[],
): readonly OfficeFileViewerWarning[] {
  return mergeOfficeWarnings(runtimeWarnings, [
    ...collectOfficeFileWarnings(fileName, preview.previewKind),
    ...collectOfficePreviewWarnings(preview),
  ]);
}
