---
title: Plugin options
description: Plugin options
keywords:
  - Filumo
  - API
siteLayout: docs
toc: content
---

# Plugin options

Factory configuration is fixed for a viewer instance. Recreate the plugin array/viewer when these policies change; use viewer.update only for view options. The types below come from each public factory contract.

Worker strategies are format-specific. Code highlighting requires a Worker; disabling it retains readable source. Resource budgets constrain owned work, not total browser-process memory.

## office · @filumo/office

| Field | Type | Default / behavior |
| --- | --- | --- |
| `fonts` | `OfficeFontOptions` | Optional aliases, fallbacks and authorized font sources |
| `media` | `false \| OfficeMediaOptions` | Optional; external media blocked by default, false disables media |
| `onWarning` | `(warning: OfficeWarning) => void` | Optional OfficeWarning callback |
| `onHyperlinkActivate` | `(event: OfficeHyperlinkActivateEvent) => void` | OfficeHyperlinkActivateEvent; preventDefault() can intercept navigation. |
| `worker` | `'auto' \| 'always' \| 'never'` | auto; Code keeps source when its Worker is unavailable |
| `workerFactory` | `() => Worker` | Omitted: bundled ESM Worker |
| `resourcePolicy` | `{ maxFileBytes?: number; timeoutMs?: number; maxArchiveEntries?: number; maxArchiveEntryBytes?: number; maxArchiveInflatedBytes?: number; maxCompressionRatio?: number; }` | Optional Office archive and parsing budgets; separate from common source policy |

[Package README and public types](https://github.com/gyxing/filumo-viewer/tree/master/packages/office#readme)

## image · @filumo/image

| Field | Type | Default / behavior |
| --- | --- | --- |
| `maxDecodedPixels` | `number` | Omitted; checks natural dimensions after decode, not a pre-decode memory cap |

[Package README and public types](https://github.com/gyxing/filumo-viewer/tree/master/packages/image#readme)

## pdf · @filumo/pdf

| Field | Type | Default / behavior |
| --- | --- | --- |
| `workerFactory` | `() => Worker` | Omitted: bundled ESM Worker |
| `workerSrc` | `string` | Omitted; bundled adapted entry |
| `assetsBaseUrl` | `string` | Omitted; bundled assets |
| `cMapUrl` | `string` | Bundled compressed CMaps; optional directory override |
| `standardFontDataUrl` | `string` | Bundled standard fonts; optional directory override |
| `wasmUrl` | `string` | Bundled WASM and JS fallbacks; optional directory override |
| `iccUrl` | `string` | Bundled ICC data; optional directory override |
| `useWasm` | `boolean` | true |
| `renderConcurrency` | `number` | 2 page tasks |
| `maxDpr` | `number` | 2 |
| `maxCanvasPixels` | `number` | 8388608 pixels per canvas |
| `canvasCacheBytes` | `number` | 96 MiB |
| `textCacheBytes` | `number` | 16 MiB estimated |
| `maxSearchMatches` | `number` | 10000 matches |
| `onHyperlinkActivate` | `(url: string) => void` | URL string callback; not the Office transaction object. |

[Package README and public types](https://github.com/gyxing/filumo-viewer/tree/master/packages/pdf#readme)

## text · @filumo/text

| Field | Type | Default / behavior |
| --- | --- | --- |
| `encoding` | `TextEncoding` | auto: BOM, source hints and content detection |
| `fallback` | `boolean` | true; readable unknown content only |
| `lineNumbers` | `boolean` | true; actual line count |
| `wrap` | `boolean` | true |
| `extensions` | `readonly string[]` | Merge defaults with custom extensions |
| `worker` | `'auto' \| 'always' \| 'never'` | auto; Code keeps source when its Worker is unavailable |
| `workerFactory` | `() => Worker` | Omitted: bundled ESM Worker |

[Package README and public types](https://github.com/gyxing/filumo-viewer/tree/master/packages/text#readme)

## json · @filumo/json

| Field | Type | Default / behavior |
| --- | --- | --- |
| `variant` | `'auto' \| 'json' \| 'jsonc' \| 'lines'` | auto; explicit json/jsonc/lines supported |
| `maxRecords` | `number` | 1000000 records |
| `maxCachedRecords` | `number` | 3 records |
| `maxCachedNodes` | `number` | 200000 nodes |
| `encoding` | `TextEncoding` | auto: BOM, source hints and content detection |
| `initialMode` | `'tree' \| 'source'` | tree |
| `initialExpandDepth` | `number` | 2 levels |
| `maxDepth` | `number` | 256 levels |
| `maxNodes` | `number` | 200000 nodes |
| `worker` | `'auto' \| 'always' \| 'never'` | auto; Code keeps source when its Worker is unavailable |
| `workerFactory` | `() => Worker` | Omitted: bundled ESM Worker |

[Package README and public types](https://github.com/gyxing/filumo-viewer/tree/master/packages/json#readme)

## markdown · @filumo/markdown

| Field | Type | Default / behavior |
| --- | --- | --- |
| `encoding` | `TextEncoding` | auto: BOM, source hints and content detection |
| `initialMode` | `'reading' \| 'source'` | reading |
| `outline` | `boolean` | true |
| `highlight` | `boolean` | true |
| `maxHighlightChars` | `number` | 65536 UTF-16 code units |
| `baseUrl` | `string` | Omitted; remote source URL may be used, local files need an explicit base |
| `resolveResource` | `( reference: string, kind: 'image' \| 'link', signal: AbortSignal, ) => string \| undefined \| Promise<string \| undefined>` | Optional; undefined blocks the resource without falling back to the original reference |
| `worker` | `'auto' \| 'always' \| 'never'` | auto; Code keeps source when its Worker is unavailable |
| `workerFactory` | `() => Worker` | Omitted: bundled ESM Worker |

[Package README and public types](https://github.com/gyxing/filumo-viewer/tree/master/packages/markdown#readme)

## csv · @filumo/csv

| Field | Type | Default / behavior |
| --- | --- | --- |
| `encoding` | `TextEncoding` | auto: BOM, source hints and content detection |
| `worker` | `'auto' \| 'always' \| 'never'` | auto; Code keeps source when its Worker is unavailable |
| `workerFactory` | `() => TaskWorker` | Omitted: bundled ESM Worker |
| `delimiter` | `CsvDelimiter` | auto; TSV defaults to Tab |
| `header` | `boolean` | true; first row is a header |
| `initialMode` | `'table' \| 'source'` | table |
| `maxRows` | `number` | 1000000 rows |
| `maxColumns` | `number` | 4096 columns |
| `maxCachedCells` | `number` | 20000 cells |
| `cellCacheBytes` | `number` | 4 MiB estimated cache |
| `maxCellDetailChars` | `number` | 65536 UTF-16 code units |

[Package README and public types](https://github.com/gyxing/filumo-viewer/tree/master/packages/csv#readme)

## xml · @filumo/xml

| Field | Type | Default / behavior |
| --- | --- | --- |
| `encoding` | `TextEncoding` | auto: BOM, source hints and content detection |
| `worker` | `'auto' \| 'always' \| 'never'` | auto; Code keeps source when its Worker is unavailable |
| `workerFactory` | `() => TaskWorker` | Omitted: bundled ESM Worker |
| `initialMode` | `'tree' \| 'source'` | tree |
| `maxDepth` | `number` | 256 levels |
| `maxNodes` | `number` | 200000 nodes |

[Package README and public types](https://github.com/gyxing/filumo-viewer/tree/master/packages/xml#readme)

## code · @filumo/code

| Field | Type | Default / behavior |
| --- | --- | --- |
| `encoding` | `TextEncoding` | auto: BOM, source hints and content detection |
| `worker` | `'auto' \| 'always' \| 'never'` | auto; Code keeps source when its Worker is unavailable |
| `workerFactory` | `() => TaskWorker` | Omitted: bundled ESM Worker |
| `language` | `CodeLanguage \| 'auto'` | auto; detect from filename or select CodeLanguage |
| `maxHighlightChars` | `number` | 262144 UTF-16 code units |
| `maxHighlightRanges` | `number` | 100000 decoration ranges |
| `highlightTimeout` | `number` | 5000 ms |

[Package README and public types](https://github.com/gyxing/filumo-viewer/tree/master/packages/code#readme)

CodeLanguage values: `javascript`, `typescript`, `html`, `css`, `less`, `scss`, `sass`, `bash`, `python`, `sql`, `java`, `c`, `cpp`, `csharp`, `go`, `rust`, `yaml`, `toml`, `powershell`, `batch`, `php`, `ruby`, `kotlin`, `swift`, `lua`, `dockerfile`, `makefile`, `cmake`, `graphql`, `protobuf`, `diff`, `dotenv`, `plaintext`.

CsvDelimiter values: auto, comma, semicolon, Tab (\t), or pipe. The extension and current table mode determine the initial delimiter.

## Source and units

TextEncoding is auto, utf-8, utf-16le, utf-16be, gbk or gb18030. Bytes are bytes, timeouts are milliseconds, and source-length limits count UTF-16 code units. [Deployment](./deployment) shows Worker and Markdown-resource examples; [format limits](./compatibility) remain applicable.
