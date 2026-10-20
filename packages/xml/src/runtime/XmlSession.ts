import type { TextContent } from '@fivo/core/text';
import type { XmlOptions } from '../options';
import type { XmlParseResult } from '../parser/types';
/** 原文模式不解析 XML，结构按成功提交的内容版本缓存。 */
export class XmlSession {
  mode: 'tree' | 'source';
  // 与工具栏共用显示状态，原文重新挂载时不重置行号开关。
  lineNumbers = true;
  whitespace = false;
  private parsed?: {
    revision: number;
    promise: Promise<XmlParseResult>;
    controller: AbortController;
    ready: boolean;
  };
  constructor(readonly content: TextContent, readonly options: XmlOptions) {
    this.mode = options.initialMode ?? 'tree';
  }
  ensureParsed(): Promise<XmlParseResult> {
    const revision = this.content.revision;
    if (this.parsed?.revision === revision) return this.parsed.promise;
    this.pause();
    const controller = new AbortController();
    const promise = this.content.run<XmlParseResult>(
      'parse-xml',
      {
        text: this.content.document!.text,
        maxDepth: this.options.maxDepth ?? 256,
        maxNodes: this.options.maxNodes ?? 200000,
      },
      controller.signal,
    );
    const entry = { revision, promise, controller, ready: false };
    this.parsed = entry;
    void promise.then(
      () => {
        entry.ready = true;
      },
      () => {
        if (this.parsed === entry) this.parsed = undefined;
      },
    );
    return promise;
  }
  /** 结构不可见时只取消尚未完成的任务，保留已提交模型。 */
  pause(): void {
    if (this.parsed && !this.parsed.ready) {
      this.parsed.controller.abort();
      this.parsed = undefined;
    }
  }
  dispose(): void {
    this.parsed?.controller.abort();
    this.parsed = undefined;
  }
}
