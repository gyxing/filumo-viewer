import { FivoError } from '@fivo/core';
/** 第三方错误统一为稳定格式错误，来源本身的错误码保持不变。 */
export function pdfError(cause: unknown): Error {
  if (cause instanceof FivoError) return cause;
  return new FivoError(
    'PDF_READ_FAILED',
    cause instanceof Error ? cause.message : String(cause),
  );
}
