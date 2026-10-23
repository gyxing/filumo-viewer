import { throwIfAborted } from '@filumo/core';
import { validateJsonRecord } from './validateJsonRecord';
import type { JsonLinesResult } from './linesTypes';

/** 一个非空物理行一条记录，原始行号与源范围不因空行改变。 */
export async function scanJsonLines(
  text: string,
  options: { maxRecords: number; maxDepth: number; maxNodes: number },
  signal: AbortSignal,
): Promise<JsonLinesResult> {
  const starts: number[] = [],
    ends: number[] = [],
    lines: number[] = [],
    valid: number[] = [];
  let start = 0,
    line = 1,
    next = 65536;
  for (let i = 0; i <= text.length; i++) {
    if (
      i >= next ||
      (starts.length && starts.length % 256 === 0 && i === start)
    ) {
      await new Promise<void>((r) => { setTimeout(r, 0); });
      throwIfAborted(signal);
      next = i + 65536;
    }
    if (i !== text.length && text[i] !== '\r' && text[i] !== '\n') continue;
    if (text.slice(start, i).trim()) {
      if (starts.length >= options.maxRecords)
        return {
          kind: 'limited',
          message: 'JSON 记录数超过限制，请查看整文件原文。',
          offset: start,
        };
      const ok = await validateJsonRecord(text, start, i, options, signal);
      starts.push(start);
      ends.push(i);
      lines.push(line);
      valid.push(ok ? 1 : 0);
    }
    if (text[i] === '\r' && text[i + 1] === '\n') i++;
    start = i + 1;
    line++;
  }
  throwIfAborted(signal);
  return {
    kind: 'ready',
    index: {
      starts: Uint32Array.from(starts),
      ends: Uint32Array.from(ends),
      lineNumbers: Uint32Array.from(lines),
      valid: Uint8Array.from(valid),
    },
  };
}
