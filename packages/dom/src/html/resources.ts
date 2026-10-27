import type { DocumentResourceContext } from '@filumo/core';

/** 回调返回空即阻止，不能在私有归档资源被拒绝后回退请求公网。 */
export async function resolveHtmlResource(
  reference: string,
  kind: 'image' | 'link',
  resources: DocumentResourceContext | undefined,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (signal.aborted) return;
  if (kind === 'link' && reference.startsWith('#')) return reference;
  if (kind === 'image' && !resources?.resolveResource && !resources?.baseUrl)
    return;
  const resolved = resources?.resolveResource
    ? await resources.resolveResource(reference, kind, signal)
    : reference;
  if (!resolved || signal.aborted) return;
  try {
    const url = new URL(resolved, resources?.baseUrl);
    if (
      [
        'http:',
        'https:',
        'blob:',
        ...(kind === 'link' ? ['mailto:'] : []),
      ].includes(url.protocol)
    )
      return url.href;
  } catch {
    /* 相对地址没有明确基址时保留占位。 */
  }
}
