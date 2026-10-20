import type { DocumentSource } from '@fivo/core';
import type { JsonOptions } from '../options';
/** 明确后缀优先，强制变体只在宿主显式配置时生效。 */
export function resolveJsonVariant(
  source: DocumentSource,
  options: JsonOptions,
): 'json' | 'jsonc' | 'lines' {
  if (options.variant && options.variant !== 'auto') return options.variant;
  const ext = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (ext === '.jsonc') return 'jsonc';
  if (ext === '.jsonl' || ext === '.ndjson') return 'lines';
  if (ext) return 'json';
  const mime = source.mimeType?.split(';')[0].trim().toLowerCase();
  return mime === 'application/jsonc'
    ? 'jsonc'
    : [
        'application/x-ndjson',
        'application/ndjson',
        'application/jsonl',
      ].includes(mime ?? '')
    ? 'lines'
    : 'json';
}
