import { TextContent } from '@fivo/text/reader';
import type { JsonOptions } from '../options';
import type { JsonParseResult } from '../parser/types';
/** 结构解析按内容版本缓存，原文模式不触发扫描器加载。 */
export class JsonSession {
  mode: 'tree' | 'source';
  private parsed?: { revision: number; promise: Promise<JsonParseResult> };
  constructor(readonly content: TextContent, readonly options: JsonOptions) {
    this.mode = options.initialMode ?? 'tree';
  }
  /** 首次进入结构模式才发送解析任务，失败 Promise 不阻断显式重试。 */
  ensureParsed() {
    const revision = this.content.revision;
    if (this.parsed?.revision === revision) return this.parsed.promise;
    const promise = this.content.run<JsonParseResult>('parse-json', {
      text: this.content.document!.text,
      maxDepth: this.options.maxDepth ?? 256,
      maxNodes: this.options.maxNodes ?? 200000,
    });
    this.parsed = { revision, promise };
    void promise.catch(() => {
      if (this.parsed?.promise === promise) this.parsed = undefined;
    });
    return promise;
  }
}
