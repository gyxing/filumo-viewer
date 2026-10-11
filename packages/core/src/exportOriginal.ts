import { throwIfAborted } from './errors';
import type { DocumentSource } from './types';
/** 导出原始内容的副本；预览投影、修订显示和调用方修改不会改变原件缓存。 */
export async function exportOriginal(
  source: DocumentSource,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; name?: string; mimeType?: string }> {
  throwIfAborted(signal);
  const bytes = await source.readAll(signal);
  throwIfAborted(signal);
  return { bytes: bytes.slice(), name: source.name, mimeType: source.mimeType };
}
