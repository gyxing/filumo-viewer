import type { Sample } from './types';

/** 构建与环境文件的身份取决于完整文件名，不能用样本标签重新拼接后缀。 */
export function sampleFileName(
  sample: Pick<Sample, 'fileName' | 'label' | 'extension'>,
): string {
  if (sample.fileName) return sample.fileName;
  const extension = sample.extension.replace(/^\./, '');
  return extension &&
    !sample.label.toLowerCase().endsWith('.' + extension.toLowerCase())
    ? sample.label + '.' + extension
    : sample.label;
}
