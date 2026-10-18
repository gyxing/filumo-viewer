import type { DocumentSource, OpenContext } from '@fivo/core';
import { createSession, FivoError, throwIfAborted } from '@fivo/core';
import type { TextOptions } from '../options';
import { TextContent } from '../reader/TextContent';
import { isBinaryDocument } from '../reader/binarySignature';
export interface TextSessionData {
  content: TextContent;
  options: TextOptions;
}
/** 显式文本保留编码恢复入口，自动兜底只交付完整校验通过的会话。 */
export async function openText(
  source: DocumentSource,
  context: OpenContext,
  options: TextOptions & { workerFactory: () => Worker },
  fallback = false,
) {
  context.reportProgress({ phase: '读取文本', loaded: 0, total: 1 });
  // 响应头在 readAll 后才可用，必须按此顺序采集 charset。
  const bytes = await source.readAll(context.signal);
  throwIfAborted(context.signal);
  if (fallback && isBinaryDocument(bytes))
    throw new FivoError('UNSUPPORTED_FORMAT', '该文件无法按纯文本读取');
  const content = new TextContent(
    bytes,
    { ...options, mimeType: source.mimeType },
    context.signal,
  );
  try {
    // 自动兜底不能被宿主的手动编码绕过可读性校验，确认可读后仍允许用户切换编码。
    await content.setEncoding(fallback ? 'auto' : options.encoding ?? 'auto');
    throwIfAborted(context.signal);
    if (fallback && !content.document) {
      if (content.error) throw new FivoError('TEXT_READ_FAILED', content.error);
      throw new FivoError('UNSUPPORTED_FORMAT', '该文件无法按纯文本读取');
    }
    context.reportProgress(undefined);
    return createSession<TextSessionData>({
      sessionId: context.sessionId,
      source,
      signal: context.signal,
      format: 'text',
      data: { content, options },
      dispose: content.dispose,
    });
  } catch (error) {
    content.dispose();
    throw error;
  }
}
