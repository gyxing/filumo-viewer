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
