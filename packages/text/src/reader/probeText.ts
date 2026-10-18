import { throwIfAborted } from '@fivo/core';
import type { DocumentSource, ResourcePolicy } from '@fivo/core';
import { isBinaryDocument } from './binarySignature';
import { decodeTextBytes } from './detectEncoding';

const PROBE_BYTES = 64 * 1024;

/** 只做有界前缀探测；最终打开仍需全文校验，读取错误和取消按原错误向上传递。 */
export async function probeTextSource(
  source: DocumentSource,
  signal: AbortSignal,
  policy?: ResourcePolicy,
): Promise<boolean> {
  throwIfAborted(signal);
  const length = Math.max(0, Math.floor(Math.min(
    PROBE_BYTES, source.size ?? PROBE_BYTES, policy?.maxFileBytes ?? PROBE_BYTES,
  )));
  const bytes = source.readRange
    ? await source.readRange(0, length, signal)
    : await source.readAll(signal);
  throwIfAborted(signal);
  const prefix = bytes.subarray(0, length);
  if (isBinaryDocument(prefix)) return false;
  const partial = source.size === undefined || source.size > prefix.length;
  const decoded = await decodeTextBytes(prefix, { signal, mimeType: source.mimeType, partial });
  throwIfAborted(signal);
  return Boolean(decoded);
}
