import type { DocumentResourceContext } from '@filumo/core';
import type { TaskWorker, TextEncoding } from '@filumo/core/text';
export type CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'css'
  | 'less'
  | 'scss'
  | 'sass'
  | 'bash'
  | 'python'
  | 'sql'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'yaml'
  | 'toml'
  | 'powershell'
  | 'batch'
  | 'php'
  | 'ruby'
  | 'kotlin'
  | 'swift'
  | 'lua'
  | 'dockerfile'
  | 'makefile'
  | 'cmake'
  | 'graphql'
  | 'protobuf'
  | 'diff'
  | 'dotenv'
  | 'plaintext';
export interface CodeOptions {
  html?: DocumentResourceContext & { initialMode?: 'source' | 'reading' };
  encoding?: TextEncoding;
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => TaskWorker;
  language?: CodeLanguage | 'auto';
  maxHighlightChars?: number;
  maxHighlightRanges?: number;
  highlightTimeout?: number;
}
