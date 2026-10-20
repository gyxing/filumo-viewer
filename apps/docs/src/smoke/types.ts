import type { CsvOptions } from '@fivo/csv';
import type { XmlOptions } from '@fivo/xml';
import type { CodeOptions } from '@fivo/code';
import type { ViewerConfiguration } from '@fivo/dom';
import type { ImageOptions } from '@fivo/image';
import type { JsonOptions } from '@fivo/json';
import type { MarkdownOptions } from '@fivo/markdown';
import type { OfficeOptions } from '@fivo/office';
import type { PdfOptions } from '@fivo/pdf';
import type { TextOptions } from '@fivo/text';
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
