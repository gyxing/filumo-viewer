import { abortError } from '@filumo/core';
import type { TextContent } from '@filumo/core/text';
import type { JsonOptions } from '../options';
import type { JsonLinesResult } from '../parser/linesTypes';
import type { JsonParseResult } from '../parser/types';
import { JsonSession } from './JsonSession';

/** 全文件只缓存记录索引，结构结果按当前记录与节点预算进行 LRU 管理。 */
export class JsonLinesSession extends JsonSession {
  private indexed?: {
    revision: number;
    promise: Promise<JsonLinesResult>;
    controller: AbortController;
    ready: boolean;
  };
  private records = new Map<
    number,
    {
      promise: Promise<JsonParseResult>;
      nodes: number;
      controller: AbortController;
      ready: boolean;
    }
  >();
  private cachedNodes = 0;
  private current = 0;
  constructor(content: TextContent, options: JsonOptions) {
    super(content, options, 'lines');
  }
  ensureIndex(): Promise<JsonLinesResult> {
    const revision = this.content.revision;
    if (this.indexed?.revision === revision) return this.indexed.promise;
    this.pause();
    this.records.clear();
    this.cachedNodes = 0;
    const controller = new AbortController();
    const promise = this.content.run<JsonLinesResult>(
      'index-json-lines',
      {
        text: this.content.document!.text,
        maxRecords: this.options.maxRecords ?? 1000000,
        maxDepth: this.options.maxDepth ?? 256,
        maxNodes: this.options.maxNodes ?? 200000,
      },
      controller.signal,
    );
    const entry = { revision, promise, controller, ready: false };
    this.indexed = entry;
    void promise.then(
      () => {
        entry.ready = true;
      },
      () => {
        if (this.indexed === entry) this.indexed = undefined;
      },
    );
    return promise;
  }
  async ensureRecord(index: number): Promise<JsonParseResult> {
    const revision = this.content.revision,
      text = this.content.document!.text,
      result = await this.ensureIndex();
    if (revision !== this.content.revision) throw abortError();
    if (
      result.kind !== 'ready' ||
      index < 0 ||
      index >= result.index.starts.length
    )
      throw new Error('记录超出范围');
    const cached = this.records.get(index);
    if (cached) {
      this.records.delete(index);
      this.records.set(index, cached);
      return cached.promise;
    }
    const controller = new AbortController();
    const promise = this.content.run<JsonParseResult>(
      'parse-json',
      {
        text: text.slice(result.index.starts[index], result.index.ends[index]),
        maxDepth: this.options.maxDepth ?? 256,
        maxNodes: this.options.maxNodes ?? 200000,
        variant: 'json',
      },
      controller.signal,
    );
    const entry = { promise, nodes: 0, controller, ready: false };
    this.records.set(index, entry);
    const prune = () => {
      while (
        this.records.size > (this.options.maxCachedRecords ?? 3) ||
        this.cachedNodes > (this.options.maxCachedNodes ?? 200000)
      ) {
        const key =
          [...this.records.keys()].find((key) => key !== this.current) ??
          (this.records.keys().next().value as number);
        const old = this.records.get(key)!;
        this.cachedNodes -= old.nodes;
        if (!old.ready) old.controller.abort();
        this.records.delete(key);
      }
    };
    prune();
    void promise.then(
      (parsed) => {
        if (
          this.records.get(index) === entry &&
          revision === this.content.revision
        ) {
          entry.ready = true;
          entry.nodes =
            parsed.kind === 'ready' ? parsed.document.nodes.length : 0;
          this.cachedNodes += entry.nodes;
          prune();
        }
      },
      () => {
        if (this.records.get(index) === entry) {
          this.cachedNodes -= entry.nodes;
          this.records.delete(index);
        }
      },
    );
    return promise;
  }
  ensureParsed(): Promise<JsonParseResult> {
    return this.ensureRecord(this.current);
  }
  setCurrent(index: number): void {
    this.current = Math.max(0, Math.floor(index));
  }
  getCurrent(): number {
    return this.current;
  }
  pause(): void {
    if (this.indexed && !this.indexed.ready) {
      this.indexed.controller.abort();
      this.indexed = undefined;
    }
    for (const [key, entry] of this.records)
      if (!entry.ready) {
        entry.controller.abort();
        this.records.delete(key);
      }
  }
  dispose(): void {
    this.pause();
    super.dispose();
    this.indexed = undefined;
    this.records.clear();
    this.cachedNodes = 0;
  }
}
