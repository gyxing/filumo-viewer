import { readSourceBytes, throwIfAborted } from '@filumo/core';
import type { ViewContext, ViewerCapabilities } from '@filumo/dom';
/** 大包下载不复用默认全文导出路径；无 Blob 时必须有界读取或由宿主接管。 */
export async function archiveDownload(context: ViewContext, limit: number) {
  const source = context.session.source,
    document = context.container.ownerDocument,
    window = document.defaultView;
  const blob = await source.readBlob?.(context.session.signal);
  const leases = new Map<string, number>();
  const enabled =
    !!blob ||
    (source.size === undefined ? !!source.openStream : source.size <= limit);
  const capability: ViewerCapabilities['originalDownload'] = {
    enabled,
    reason:
      context.options.locale === 'en-US'
        ? 'Large remote archives require a host download handler'
        : '大远程压缩包需要宿主接管下载',
  };
  if (!blob && enabled)
    capability.run = async (signal) => {
      const bytes = await readSourceBytes(source, limit, signal);
      throwIfAborted(signal);
      if (!window) throw new Error('下载窗口不可用');
      const url = window.URL.createObjectURL(
          new Blob([bytes], { type: source.mimeType }),
        ),
        link = document.createElement('a');
      link.href = url;
      link.download = source.name ?? 'archive';
      link.hidden = true;
      context.container.append(link);
      try {
        link.click();
      } finally {
        link.remove();
      }
      const timer = window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
        leases.delete(url);
      }, 1000);
      leases.set(url, timer);
    };
  return {
    capability,
    dispose() {
      for (const [url, timer] of leases) {
        window?.clearTimeout(timer);
        window?.URL.revokeObjectURL(url);
      }
      leases.clear();
    },
  };
}
