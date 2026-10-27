import type { DocumentResourceContext } from '@filumo/core';
import { relativeEntryPath } from '../reader/archivePath';
import type { ArchiveLevel, ArchiveSession } from '../runtime/ArchiveSession';
/** 相邻图片只访问本层合法唯一条目，链接不生成可执行的原始 HTML Blob。 */
export class EntryResources {
  readonly resources: DocumentResourceContext;
  private urls = new Map<string, Promise<string | undefined>>();
  private releases = new Set<string>();
  private closed = false;
  constructor(
    session: ArchiveSession,
    level: ArchiveLevel,
    path: string,
    private signal: AbortSignal,
    private window: Window & typeof globalThis,
  ) {
    this.resources = {
      resolveResource: async (reference, kind) => {
        if (this.closed || signal.aborted) return;
        if (reference.startsWith('#')) return reference;
        // 文档链接保持显式阻止，不能在预解析 Markdown 链接时触发提取或执行活动文档。
        if (kind === 'link') return;
        const target = relativeEntryPath(path, reference);
        if (!target) return;
        const entries = level.entries.filter((e) => e.path === target);
        if (entries.length !== 1 || entries[0].kind !== 'file') return;
        const type = imageMime(target);
        if (!type) return;
        if (!this.urls.has(target))
          this.urls.set(
            target,
            (async () => {
              const bytes = await session.bytes(entries[0], signal, level);
              if (this.closed || signal.aborted) return;
              const url = this.window.URL.createObjectURL(
                new Blob([bytes], { type }),
              );
              this.releases.add(url);
              return url;
            })(),
          );
        return this.urls.get(target);
      },
    };
  }
  dispose() {
    this.closed = true;
    for (const url of this.releases) this.window.URL.revokeObjectURL(url);
    this.releases.clear();
    this.urls.clear();
  }
}
function imageMime(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  return (
    {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      avif: 'image/avif',
    } as Record<string, string>
  )[extension ?? ''];
}
