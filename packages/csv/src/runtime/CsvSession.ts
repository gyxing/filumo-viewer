import { throwIfAborted } from '@filumo/core';
import type { TextContent } from '@filumo/core/text';
import type { CsvOptions } from '../options';
import type { CsvCell, CsvDelimiter, CsvParseResult } from '../parser/types';

/** 已提交表格与原文同版本，分隔符尝试失败不覆盖原表格。 */
export class CsvSession {
  mode: 'table' | 'source';
  header: boolean;
  delimiter: CsvDelimiter;
  private parsed?: {
    revision: number;
    delimiter: CsvDelimiter;
    promise: Promise<CsvParseResult>;
    controller: AbortController;
    ready: boolean;
  };
  private changing = new AbortController();
  private attempt = 0;
  private values = new Map<string, string>();
  private bytes = 0;
  constructor(
    readonly content: TextContent,
    readonly options: CsvOptions,
    delimiter: CsvDelimiter,
  ) {
    this.mode = options.initialMode ?? 'table';
    this.header = options.header !== false;
    this.delimiter = delimiter;
  }
  /** 仅首次进入表格或内容版本变化时请求索引。 */
  ensureIndex(): Promise<CsvParseResult> {
    const revision = this.content.revision;
    if (
      this.parsed?.revision === revision &&
      this.parsed.delimiter === this.delimiter
    )
      return this.parsed.promise;
    this.parsed?.controller.abort();
    this.values.clear();
    this.bytes = 0;
    const controller = new AbortController();
    const promise = this.content.run<CsvParseResult>(
      'index-csv',
      {
        text: this.content.document!.text,
        options: {
          delimiter: this.delimiter,
          maxRows: this.options.maxRows ?? 1000000,
          maxColumns: this.options.maxColumns ?? 4096,
        },
      },
      controller.signal,
    );
    const entry = {
      revision,
      delimiter: this.delimiter,
      promise,
      controller,
      ready: false,
    };
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
  /** 参数新结果有效后才替换，避免错误选择清空正在阅读的表格。 */
  async setDelimiter(delimiter: CsvDelimiter): Promise<void> {
    if (!['auto', ',', ';', '\t', '|'].includes(delimiter))
      throw new Error('分隔符无效');
    this.changing.abort();
    const own = (this.changing = new AbortController()),
      attempt = ++this.attempt,
      revision = this.content.revision;
    const promise = this.content.run<CsvParseResult>(
      'index-csv',
      {
        text: this.content.document!.text,
        options: {
          delimiter,
          maxRows: this.options.maxRows ?? 1000000,
          maxColumns: this.options.maxColumns ?? 4096,
        },
      },
      own.signal,
    );
    const result = await promise;
    if (
      own.signal.aborted ||
      attempt !== this.attempt ||
      revision !== this.content.revision
    )
      return;
    if (result.kind !== 'ready')
      throw new Error(result.diagnostics[0]?.message ?? '无法解析表格');
    this.delimiter = delimiter;
    this.parsed?.controller.abort();
    this.parsed = {
      revision,
      delimiter,
      promise,
      controller: own,
      ready: true,
    };
    this.values.clear();
    this.bytes = 0;
  }
  /** 行元数据不缓存全文矩阵，由视图自己的有限窗口持有。 */
  async getRow(row: number, signal: AbortSignal): Promise<readonly CsvCell[]> {
    const revision = this.content.revision,
      text = this.content.document!.text;
    const result = await this.ensureIndex();
    throwIfAborted(signal);
    if (revision !== this.content.revision)
      throw new DOMException('内容已更新', 'AbortError');
    if (result.kind !== 'ready') return [];
    return (await import('../parser/csvCells')).readCsvRow(
      text,
      result.index,
      row,
      signal,
    );
  }
  /** 预览和完整字段分开缓存，超出预算的单值只交付调用方。 */
  async value(
    cell: CsvCell,
    maxChars: number | undefined,
    signal: AbortSignal,
  ): Promise<string> {
    const revision = this.content.revision,
      key = revision + ':' + cell.start + ':' + cell.end + ':' + maxChars;
    const cached = this.values.get(key);
    if (cached !== undefined) {
      this.values.delete(key);
      this.values.set(key, cached);
      return cached;
    }
    const source = this.content.document!.text;
    const text = await (
      await import('../parser/csvCells')
    ).csvCellText(source, cell, { maxChars, signal });
    throwIfAborted(signal);
    if (this.content.revision !== revision) return text;
    const budget = this.options.cellCacheBytes ?? 4194304;
    if (text.length * 2 <= budget) {
      const existing = this.values.get(key);
      if (existing !== undefined) {
        this.bytes -= existing.length * 2;
        this.values.delete(key);
      }
      this.values.set(key, text);
      this.bytes += text.length * 2;
      while (
        this.values.size > (this.options.maxCachedCells ?? 20000) ||
        this.bytes > budget
      ) {
        const oldest = this.values.keys().next().value as string;
        const old = this.values.get(oldest)!;
        this.values.delete(oldest);
        this.bytes -= old.length * 2;
      }
    }
    return text;
  }
  /** 只释放本会话的派生状态，字节由公共内容拥有。 */
  pause(): void {
    this.attempt++;
    this.changing.abort();
    if (this.parsed && !this.parsed.ready) {
      this.parsed.controller.abort();
      this.parsed = undefined;
    }
  }
  dispose(): void {
    this.pause();
    this.attempt++;
    this.changing.abort();
    this.values.clear();
    this.parsed = undefined;
    this.bytes = 0;
  }
}
