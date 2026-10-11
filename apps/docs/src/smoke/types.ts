import type { ViewerConfiguration } from '@fivo/dom';
import type { OfficeOptions } from '@fivo/office';
export interface SmokeConfig {
  viewer: ViewerConfiguration;
  office: OfficeOptions;
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
  kind: string;
  message: string;
}
