import { TextContent } from '@filumo/core/text';
import type { JsonOptions } from '../options';
import type { JsonParseResult } from '../parser/types';
/** 结构解析按内容版本缓存，原文模式不触发扫描器加载。 */
export class JsonSession {
  mode: 'tree' | 'source';
  // 阅读偏好保存在当前会话中，切换视图或重新解码后仍沿用用户选择。
  lineNumbers = true;
  private parsed?: { revision: number; promise: Promise<JsonParseResult> };
  constructor(
    readonly content: TextContent,
    readonly options: JsonOptions,
    readonly variant: 'json' | 'jsonc' | 'lines' = 'json',
  ) {
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
      variant: this.variant === 'jsonc' ? 'jsonc' : 'json',
    });
    this.parsed = { revision, promise };
    void promise.catch(() => {
      if (this.parsed?.promise === promise) this.parsed = undefined;
    });
    return promise;
  }
  /** 会话结束归还派生结构，内容字节由上层统一释放。 */
  dispose(): void {
    this.parsed = undefined;
  }
}
