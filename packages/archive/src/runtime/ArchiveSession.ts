import type { DocumentSource } from '@filumo/core';
import { FilumoError, normalizeSource, throwIfAborted } from '@filumo/core';
import type { ArchiveOptions } from '../options';
import { ArchiveBudget } from '../reader/ArchiveBudget';
import { EntryCache } from '../reader/EntryCache';
import type { ArchiveEntry, ArchiveFormat } from '../reader/contracts';
import {
  archiveFormatForBytes,
  archiveFormatForName,
} from '../reader/detectArchive';
import { ArchiveWorkerClient } from '../worker/ArchiveWorkerClient';
import type { ArchiveSourceInfo } from '../worker/protocol';
export interface ArchiveLevel {
  source: DocumentSource;
  info: ArchiveSourceInfo;
  format: ArchiveFormat;
  entries: ArchiveEntry[];
  directory: string;
  selected?: string;
  scroll: number;
  expanded: Set<string>;
  query: string;
  sort: 'name' | 'size';
  positions: Map<string, { scroll: number; selected?: string }>;
}

/** 根会话持有所有层级，嵌套不会重新创建预算或隐式注册其他格式。 */
export class ArchiveSession {
  readonly budget: ArchiveBudget;
  readonly worker: ArchiveWorkerClient;
  readonly cache: EntryCache;
  readonly levels: ArchiveLevel[] = [];
  constructor(readonly options: ArchiveOptions) {
    this.budget = new ArchiveBudget(options.resourcePolicy);
    this.worker = new ArchiveWorkerClient(options, this.budget);
    this.cache = new EntryCache(this.budget.limits.cacheBytes);
  }
  private queue: Promise<unknown> = Promise.resolve();
  get current() {
    return this.levels[this.levels.length - 1];
  }
  async open(source: DocumentSource, signal: AbortSignal) {
    // 显式指定插件也遵守首版范围，避免无效读取或启动不支持的解压任务。
    if (
      /\.xz$/i.test(source.name ?? '') &&
      !/\.tar\.xz$/i.test(source.name ?? '')
    )
      throw new FilumoError(
        'UNSUPPORTED_FORMAT',
        '暂不支持单文件 XZ，请使用 TAR.XZ 或 TXZ 归档',
      );
    const info = this.worker.bridge.add(source);
    try {
      let format = archiveFormatForName(source.name);
      if (!format) {
        const range = await source.getRangeReader?.(signal);
        if (range)
          format = archiveFormatForBytes(
            await range.read(0, Math.min(512, range.length), signal),
          );
      }
      if (!format) throw new Error('无法识别压缩包格式');
      const entries = await this.worker.scan(info, format, signal);
      throwIfAborted(signal);
      this.levels.push({
        source,
        info,
        format,
        entries,
        directory: '',
        scroll: 0,
        expanded: new Set(['']),
        query: '',
        sort: 'name',
        positions: new Map(),
      });
    } catch (error) {
      this.worker.bridge.remove(info.id);
      throw error;
    }
  }
  async bytes(entry: ArchiveEntry, signal: AbortSignal, level = this.current) {
    throwIfAborted(signal);
    if (entry.kind !== 'file') throw new Error(entry.error ?? '此条目不能预览');
    this.budget.entry(entry.size);
    const key = level.info.id + ':' + entry.id,
      cached = this.cache.get(key);
    if (cached) return cached;
    const pending = this.queue
      .catch(() => undefined)
      .then(async () => {
        throwIfAborted(signal);
        return this.worker.extract(level.info, level.format, entry.id, signal);
      });
    // 队列仅保留完成状态，避免最后一次大文件正文被 Promise 长期持有。
    this.queue = pending.then(
      () => undefined,
      () => undefined,
    );
    const bytes = await pending;
    throwIfAborted(signal);
    this.budget.entry(bytes.length);
    if (bytes.length !== entry.size)
      throw new Error('归档文件大小与声明不一致');
    this.cache.set(key, bytes);
    return bytes;
  }
  async enter(entry: ArchiveEntry, signal: AbortSignal) {
    throwIfAborted(signal);
    this.budget.depth(this.levels.length);
    const bytes = await this.bytes(entry, signal);
    const blob = new File([bytes], entry.path.split('/').pop() ?? 'archive');
    const source = await normalizeSource(blob);
    try {
      await this.open(source, signal);
    } catch (error) {
      await source.dispose();
      throw error;
    }
  }
  async back() {
    if (this.levels.length < 2) return;
    const level = this.levels.pop()!;
    await this.worker.reset();
    this.worker.bridge.remove(level.info.id);
    await level.source.dispose();
  }
  async dispose() {
    await this.worker.dispose();
    this.cache.clear();
    for (const level of this.levels.slice(1)) await level.source.dispose();
    this.levels.length = 0;
  }
}
