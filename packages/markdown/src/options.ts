import type { TextEncoding } from '@fivo/core/text';
export interface MarkdownOptions {
  encoding?: TextEncoding;
  initialMode?: 'reading' | 'source';
  outline?: boolean;
  highlight?: boolean;
  maxHighlightChars?: number;
  baseUrl?: string;
  resolveResource?: (
    reference: string,
    kind: 'image' | 'link',
    signal: AbortSignal,
  ) => string | undefined | Promise<string | undefined>;
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => Worker;
}
