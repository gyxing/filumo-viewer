import type { DocumentSource } from '@filumo/core';
import { exportOriginal, throwIfAborted } from '@filumo/core';
import type { ViewerCapabilities } from '../capabilities/types';

/** 宿主接管可以处理格式默认下载通道禁止的来源，未就绪与停用状态仍不可下载。 */
export function originalDownloadAvailability(
  ready: boolean,
  active: boolean,
  handled: boolean,
  override?: ViewerCapabilities['originalDownload'],
) {
  const enabled = ready && active && (handled || override?.enabled !== false);
  return { enabled, reason: enabled ? undefined : override?.reason };
}

/** 显式接管优先于默认物化，原始 Blob 不经过全文数组复制。 */
export async function prepareOriginalDownload(
  source: DocumentSource,
  signal: AbortSignal,
  handler?: (source: DocumentSource, signal: AbortSignal) => Promise<void>,
  override?: ViewerCapabilities['originalDownload'],
): Promise<{ blob: Blob; name?: string } | undefined> {
  throwIfAborted(signal);
  if (handler) {
    await handler(source, signal);
    return;
  }
  if (override?.enabled === false)
    throw new Error(override.reason ?? '当前来源需要宿主接管下载');
  if (override?.run) {
    await override.run(signal);
    return;
  }
  const blob = await source.readBlob?.(signal);
  throwIfAborted(signal);
  if (blob) return { blob, name: source.name };
  const file = await exportOriginal(source, signal);
  return {
    blob: new Blob([file.bytes], { type: file.mimeType }),
    name: file.name,
  };
}
