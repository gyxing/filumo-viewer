import type { GridRange } from './contracts';
import { gridMessages } from './messages';

// 限制的是最终复制文本，不宣称浏览器总内存或剪贴板支持流式写入。
export const GRID_COPY_DEFAULTS = Object.freeze({
  maxCells: 100000,
  maxBytes: 8 * 1024 * 1024,
});

/** 完整序列化成功后才交付文本，超限或取消不产生部分剪贴板结果。 */
export async function serializeGridSelection(
  range: GridRange,
  rows: AsyncIterable<readonly string[]>,
  signal: AbortSignal,
  options: {
    maxCells?: number;
    maxBytes?: number;
    locale?: 'zh-CN' | 'en-US';
  } = {},
): Promise<string> {
  const messages = gridMessages(options.locale);
  const maxCells = options.maxCells ?? GRID_COPY_DEFAULTS.maxCells,
    maxBytes = options.maxBytes ?? GRID_COPY_DEFAULTS.maxBytes;
  if (
    !Number.isSafeInteger(maxCells) ||
    maxCells <= 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  )
    throw new Error(messages.budget);
  const height = range.endRow - range.startRow + 1,
    width = range.endColumn - range.startColumn + 1;
  if (height <= 0 || width <= 0 || height > Math.floor(maxCells / width))
    throw new Error(messages.cells);
  const lines: string[] = [];
  let bytes = 0,
    count = 0,
    work = 0;
  const check = () => {
    if (signal.aborted)
      throw signal.reason ?? new DOMException(messages.cancelled, 'AbortError');
  };
  check();
  for await (const row of rows) {
    check();
    if (++count > height || row.length !== width)
      throw new Error(messages.changed);
    const fields: string[] = [];
    for (const value of row) {
      if (value.length * 2 > maxBytes - bytes) throw new Error(messages.text);
      const field =
        height * width > 1 && /[\t\r\n"]/.test(value)
          ? '"' + value.replace(/"/g, '""') + '"'
          : value;
      bytes += field.length * 2 + (fields.length ? 2 : 0);
      if (bytes > maxBytes) throw new Error(messages.text);
      fields.push(field);
      if (++work % 1024 === 0) {
        await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
        check();
      }
    }
    if (lines.length) bytes += 2;
    if (bytes > maxBytes) throw new Error(messages.text);
    lines.push(fields.join('\t'));
  }
  check();
  if (count !== height) throw new Error(messages.incomplete);
  return lines.join('\n');
}
