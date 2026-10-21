import type { DocumentSource } from '@filumo/core';
import { throwIfAborted } from '@filumo/core';
import {
  OFFICE_FORMAT_METADATA,
  SUPPORTED_OFFICE_EXTENSIONS,
} from '../engine/parsing/formatDefinitions';
import { inferOfficeKind } from './inferOfficeKind';

/** 适配解析器所需的 File；本地文件直接复用，只有无元数据输入才检查容器目录。 */
export async function readOfficeFile(
  source: DocumentSource,
  signal: AbortSignal,
): Promise<File> {
  throwIfAborted(signal);
  const input = await source.readBlob?.(signal);
  throwIfAborted(signal);
  const data = input ?? (await source.readAll(signal));
  throwIfAborted(signal);
  const extension = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
  const inferred = Object.values(OFFICE_FORMAT_METADATA).find((format) =>
    format.mimeTypes.some(
      (type) => type.mimeType === source.mimeType?.split(';')[0],
    ),
  )?.extensions[0];
  const name =
    extension &&
    (SUPPORTED_OFFICE_EXTENSIONS as readonly string[]).includes(extension)
      ? source.name!
      : 'document' + (inferred ?? '.' + (await inferOfficeKind(data, signal)));
  throwIfAborted(signal);
  return data instanceof File && data.name === name
    ? data
    : new File([data], name, { type: source.mimeType });
}
