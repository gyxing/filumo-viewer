/** 内部 DTO 仅保留渲染需要的字段，不将第三方类型放进公开工厂合同。 */
export interface MarkdownToken {
  type: string;
  raw?: string;
  text?: string;
  tokens?: MarkdownToken[];
  items?: MarkdownToken[];
  depth?: number;
  headingId?: string;
  lang?: string;
  href?: string;
  title?: string | null;
  ordered?: boolean;
  start?: number | '';
  checked?: boolean;
  task?: boolean;
  header?: MarkdownCell[];
  rows?: MarkdownCell[][];
  align?: Array<'left' | 'right' | 'center' | null>;
}
export interface MarkdownCell {
  text: string;
  tokens: MarkdownToken[];
}
export interface MarkdownHeading {
  id: string;
  title: string;
  depth: number;
}
export interface MarkdownDocument {
  text: string;
  tokens: MarkdownToken[];
  headings: MarkdownHeading[];
}
