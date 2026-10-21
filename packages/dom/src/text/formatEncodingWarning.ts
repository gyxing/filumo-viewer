import type { TextEncodingWarning } from '@filumo/core/text';

/** 纯文字提示可供各格式轻量入口共用，不加载 DOM 阅读器。 */
export function formatEncodingWarning(
  warning: TextEncodingWarning,
  locale?: 'zh-CN' | 'en-US',
): string {
  const en = locale === 'en-US';
  const encoding =
    warning.encoding === 'auto'
      ? en
        ? 'automatic detection'
        : '自动识别'
      : warning.encoding.toUpperCase();
  const message = warning.error
    ? en
      ? `Unable to read the file again: ${warning.error}`
      : `重新读取失败：${warning.error}`
    : en
    ? `Unable to decode this file using ${encoding}. Try another encoding or detect it again.`
    : warning.encoding === 'auto'
    ? '无法自动识别此文件的编码，请尝试手动选择编码。'
    : `无法使用 ${encoding} 解码此文件，请尝试其他编码或重新自动识别。`;
  return (
    message +
    (en
      ? `\nThe original content is retained (${warning.retainedEncoding.toUpperCase()}).`
      : `\n已保留原内容，当前编码为 ${warning.retainedEncoding.toUpperCase()}。`)
  );
}
