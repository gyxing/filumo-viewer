import type { DocumentResourceContext } from '@filumo/core';
import type { TaskWorker, TextContent } from '@filumo/core/text';
import { codeLanguages } from '../fileTypes';
import type { CodeHighlightResult } from '../highlight/highlightTask';
import type { CodeLanguage, CodeOptions } from '../options';
import { CodeHighlighter } from './CodeHighlighter';
/** 原文为主数据，高亮缓存按内容版本和手动语法失效。 */
export class CodeSession {
  private highlighter: CodeHighlighter;
  private memo?: {
    revision: number;
    language: CodeLanguage;
    promise: Promise<CodeHighlightResult>;
    ready: boolean;
  };
  private active = true;
  private closed = false;
  constructor(
    readonly content: TextContent,
    readonly options: CodeOptions & { workerFactory: () => TaskWorker },
    public language: CodeLanguage,
    readonly htmlDocument = false,
    readonly resources?: DocumentResourceContext,
  ) {
    this.highlighter = new CodeHighlighter(
      options.workerFactory,
      options.highlightTimeout ?? 5000,
    );
  }
  /** 手动语法变化立即取消旧增强，保留文件内容和阅读位置。 */
  setLanguage(value: string) {
    if (!Object.hasOwn(codeLanguages, value))
      throw new Error('不支持的代码语言');
    if (value !== this.language) {
      this.highlighter.cancel();
      this.memo = undefined;
      this.language = value as CodeLanguage;
    }
  }
  /** 同一内容和语法复用增强结果，不可增强时交付可读原文状态。 */
  ensureHighlight(): Promise<CodeHighlightResult> {
    const text = this.content.document?.text,
      revision = this.content.revision,
      language = this.language;
    if (this.closed || !this.active || text === undefined)
      return Promise.resolve({ kind: 'plain', reason: 'unavailable' });
    if (this.options.worker === 'never')
      return Promise.resolve({ kind: 'plain', reason: 'disabled' });
    if (language === 'plaintext')
      return Promise.resolve({ kind: 'plain', reason: 'unknown-language' });
    if (text.length > (this.options.maxHighlightChars ?? 262144))
      return Promise.resolve({ kind: 'plain', reason: 'limit' });
    if (this.memo?.revision === revision && this.memo.language === language)
      return this.memo.promise;
    const memo = {
      revision,
      language,
      ready: false,
      promise: Promise.resolve<CodeHighlightResult>({
        kind: 'plain',
        reason: 'unavailable',
      }),
    };
    memo.promise = this.highlighter
      .run(
        {
          text,
          language,
          maxChars: this.options.maxHighlightChars ?? 262144,
          maxRanges: this.options.maxHighlightRanges ?? 100000,
        },
        this.content.taskSignal,
      )
      .then<CodeHighlightResult>((result) => {
        // Worker 消息仍需校验边界，损坏增强只能退回原文。
        let end = 0;
        if (
          !result ||
          !['ready', 'plain'].includes(result.kind) ||
          (result.kind === 'ready' &&
            (!Array.isArray(result.decorations) ||
              result.decorations.length >
                (this.options.maxHighlightRanges ?? 100000)))
        )
          return { kind: 'plain', reason: 'error' };
        if (result.kind === 'ready')
          for (const range of result.decorations) {
            if (
              !range ||
              typeof range !== 'object' ||
              !Number.isSafeInteger(range.start) ||
              !Number.isSafeInteger(range.end) ||
              range.start < end ||
              range.end <= range.start ||
              range.end > text.length ||
              !/^(?:hljs-[\w-]+|[\w-]+_)(?:\s+(?:hljs-[\w-]+|[\w-]+_))*$/.test(
                range.className,
              )
            )
              return { kind: 'plain', reason: 'error' };
            end = range.end;
          }
        memo.ready = result.kind === 'ready';
        return result;
      });
    this.memo = memo;
    return memo.promise;
  }
  /** 暂停只终止专用增强，恢复后允许重试失败或未完成的尝试。 */
  setActive(value: boolean) {
    this.active = value;
    if (!value) {
      this.highlighter.cancel();
      if (!this.memo?.ready) this.memo = undefined;
    }
  }
  /** 释放派生缓存，原始字节由 TextContent 的拥有者统一释放。 */
  dispose() {
    this.closed = true;
    this.setActive(false);
    this.memo = undefined;
  }
}
