import { FilumoError } from '@filumo/core';
/** 第三方错误统一为稳定格式错误，来源本身的错误码保持不变。 */
export function pdfError(cause: unknown): Error {
  if (cause instanceof FilumoError) return cause;
  return new FilumoError(
    'PDF_READ_FAILED',
    cause instanceof Error ? cause.message : String(cause),
  );
}
