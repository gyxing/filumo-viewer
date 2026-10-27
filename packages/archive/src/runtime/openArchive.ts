import type { DocumentSource, OpenContext } from '@filumo/core';
import { createSession } from '@filumo/core';
import type { ArchiveOptions } from '../options';
import { ArchiveSession } from './ArchiveSession';

/** 打开先建立已校验目录，具体条目只在用户选择后提取。 */
export async function openArchive(
  source: DocumentSource,
  context: OpenContext,
  options: ArchiveOptions,
) {
  const archive = new ArchiveSession(options);
  context.reportProgress({ phase: '正在读取归档目录' });
  try {
    await archive.open(source, context.signal);
    context.reportProgress(undefined);
    return createSession({
      sessionId: context.sessionId,
      source,
      signal: context.signal,
      format: 'archive',
      data: archive,
      dispose: () => archive.dispose(),
    });
  } catch (error) {
    await archive.dispose();
    throw error;
  }
}
