import type { DocumentSource, OpenContext } from '@filumo/core';
import { createSession } from '@filumo/core';
import type { TaskWorker } from '@filumo/core/text';
import { TextContent } from '@filumo/core/text';
import { codeLanguageForName, codeLanguages } from '../fileTypes';
import type { CodeOptions } from '../options';
import { CodeSession } from './CodeSession';
/** 打开只做解码，语法增强由可见视图另行申请。 */
export async function openCode(
  source: DocumentSource,
  context: OpenContext,
  options: CodeOptions & { workerFactory: () => TaskWorker },
) {
  for (const value of [
    options.maxHighlightChars ?? 262144,
    options.maxHighlightRanges ?? 100000,
    options.highlightTimeout ?? 5000,
  ])
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('代码高亮预算必须是正整数');
  if (
    options.language &&
    options.language !== 'auto' &&
    !Object.hasOwn(codeLanguages, options.language)
  )
    throw new Error('不支持的代码语言');
  const content = new TextContent(
    await source.readAll(context.signal),
    { ...options, mimeType: source.mimeType },
    context.signal,
  );
  const data = new CodeSession(
    content,
    options,
    !options.language || options.language === 'auto'
      ? source.mimeType?.split(';')[0] === 'text/html' &&
        !source.name?.match(/\.[^./\\]+$/)
        ? 'html'
        : codeLanguageForName(source.name)
      : options.language,
    /\.html?$/i.test(source.name ?? '') ||
      (!source.name?.match(/\.[^./\\]+$/) &&
        source.mimeType?.split(';')[0] === 'text/html'),
    context.resources ?? options.html,
  );
  try {
    await content.setEncoding(options.encoding ?? 'auto');
    return createSession({
      sessionId: context.sessionId,
      source,
      signal: context.signal,
      format: 'code',
      data,
      dispose: () => {
        data.dispose();
        content.dispose();
      },
    });
  } catch (error) {
    data.dispose();
    content.dispose();
    throw error;
  }
}
