export const expansionSamples: readonly {
  id: string;
  file: string;
  format: string;
  text: string;
}[];
export const codeExpansionSamples: readonly {
  id: string;
  file: string;
  format: string;
  language: string;
  text: string;
}[];
export function wideCsv(rows?: number, columns?: number): string;
