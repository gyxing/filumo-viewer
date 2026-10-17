import type { TextContent } from '@fivo/text/reader';
import type { MarkdownOptions } from '../options';
import type { MarkdownDocument } from '../parser/types';
/** 按原文版本保留 token，source 模式不触发解析或计数。 */
export class MarkdownSession {
  mode: 'reading' | 'source';
  private parsed?: { revision: number; promise: Promise<MarkdownDocument> };
  constructor(
    readonly content: TextContent,
    readonly options: MarkdownOptions,
  ) {
    this.mode = options.initialMode ?? 'reading';
  }
  /** 失败缓存可清除，编码改变后自然使用新的内容版本。 */
  ensureParsed() {
    const revision = this.content.revision;
    if (this.parsed?.revision === revision) return this.parsed.promise;
    const promise = this.content.run<MarkdownDocument>('parse-markdown', {
      text: this.content.document!.text,
    });
    this.parsed = { revision, promise };
    void promise.catch(() => {
      if (this.parsed?.promise === promise) this.parsed = undefined;
    });
    return promise;
  }
}
