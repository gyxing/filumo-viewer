import type { MarkdownOptions } from '../options';
/** 相对资源必须有明确基址；协议校验同样覆盖宿主回调的返回值。 */
export async function resolveMarkdownResource(
  reference: string,
  kind: 'image' | 'link',
  sourceUrl: string | undefined,
  options: MarkdownOptions,
  signal: AbortSignal,
) {
  if (signal.aborted) return undefined;
  const resolved = options.resolveResource
    ? await options.resolveResource(reference, kind, signal)
    : reference;
  if (!resolved || signal.aborted) return undefined;
  if (kind === 'link' && resolved.startsWith('#')) return resolved;
  try {
    const url = new URL(resolved, options.baseUrl ?? sourceUrl);
    if (
      ![
        'http:',
        'https:',
        'blob:',
        ...(kind === 'link' ? ['mailto:'] : []),
      ].includes(url.protocol)
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
