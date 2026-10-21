import type { CsvOptions } from '@filumo/csv';
import type { XmlOptions } from '@filumo/xml';
import type { CodeOptions } from '@filumo/code';
import type { ViewerConfiguration } from '@filumo/dom';
import type { ImageOptions } from '@filumo/image';
import type { JsonOptions } from '@filumo/json';
import type { MarkdownOptions } from '@filumo/markdown';
import type { OfficeOptions } from '@filumo/office';
import type { PdfOptions } from '@filumo/pdf';
import type { TextOptions } from '@filumo/text';
export interface SmokeConfig {
  viewer: ViewerConfiguration;
  office: OfficeOptions;
  csv: CsvOptions;
  xml: XmlOptions;
  code: CodeOptions;
  text: TextOptions;
  json: JsonOptions;
  markdown: MarkdownOptions;
  image: ImageOptions;
  pdf: PdfOptions;
  toolbarMode: 'default' | 'custom' | 'hidden';
}
export interface Sample {
  id: string;
  label: string;
  format: string;
  extension: string;
  /** 公共样本保留真实基本文件名，支持无后缀和多段后缀的构建/环境文件。 */
  fileName?: string;
  bytes: number;
  features?: string[];
}
export interface LogEntry {
  id: number;
  time: string;
  kind: string;
  message: string;
}
export type SmokeTarget = 'document' | 'probe';
