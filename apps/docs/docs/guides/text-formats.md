---
title: Text, structured files and code
description: Filumo text encoding, JSON variants, Markdown, CSV/TSV, XML and code previews, with defaults and limits.
keywords:
  - Filumo
  - file preview
  - document viewer
  - browser
siteLayout: docs
toc: content
---

# Text, structured files and code

Six independent plugins share Core text processing and DOM views without depending on the Text package or new framework-specific components. Published versions are listed per package on npm; see the [package overview](./packages).

```ts | pure
import { createViewer } from '@filumo/dom';
import { text, json, markdown, csv, xml, code } from '@filumo/viewer';

const viewer = createViewer(container, {
  plugins: [text(), json(), markdown(), csv(), xml(), code()],
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
});
await viewer.open(new File(['first line\nsecond line'], 'sample.txt'));
// 宿主卸载时调用，释放当前会话与视图。
async function disposePreview() {
  await viewer.destroy();
}
```

A plain string means a URL; wrap inline content in File, Blob or DocumentSource. Download preserves original bytes. The example's 20 MiB cap is a host choice, not a universal format default.

## Encoding detection and selection

Shared decoding prioritizes manual selection, BOM, source MIME charset, format hints and content inference. Automatic mode uses UTF-16 byte patterns, strict UTF-8 and GB18030, covering common GBK files. Inference remains correctable. XML also reads its encoding declaration within the first 4 KiB, below BOM and source charset priority.

The More menu selects the actual UTF-8, UTF-16LE, UTF-16BE, GBK or GB18030 encoding and offers automatic redetection. Changes reuse original bytes. A failed manual decode retains the last readable content and shows a floating warning; the encoding empty state is used only when no readable content exists.

## Default views and toolbar

| Plugin     | Initial view                                               | Source line numbers | Wrap              |
| ---------- | ---------------------------------------------------------- | ------------------- | ----------------- |
| Text       | Source                                                     | On                  | On                |
| Code       | Source                                                     | On                  | On                |
| JSON / XML | Structure; equal source/structure split in wide containers | On                  | On                |
| Markdown   | Reading                                                    | Off in source mode  | On                |
| CSV        | Table with first row as headers                            | Off in source mode  | On in source mode |

Line numbers represent real lines only. Find appears on the main toolbar by default, while encoding, views, wrapping and line numbers use format-specific More menus with first-level icons. When space is limited, Find may move into More according to its priority. Markdown keeps its outline on the main toolbar. JSON uses one stateful expand/collapse action. JSON/XML line-number choices persist within the open file across views, zoom and decoding.

## Text and unknown-file fallback

Text handles TXT, LOG, INI, CONF, CFG, PROPERTIES and OUT. Options include extensions, encoding, lineNumbers, wrap and fallback. Only after dedicated formats fail to match do unknown files undergo header, encoding and complete readability checks. Tags stay literal text. Unreadable content produces an unsupported-format result.

text({ fallback: false }) disables fallback. Initial fallback always uses automatic detection; a manual default cannot bypass readability checks. Dedicated-parser errors, network failures, timeouts and quota errors are not converted to text previews. An unregistered Text plugin is never enabled implicitly.

## JSON / JSONC / JSONL / NDJSON

JSON is strict; JSONC accepts comments and trailing commas, not JSON5. Source and structure start equally split and can be resized; containers narrower than 720px show one area at a time. Structure preserves duplicate keys and numeric source text, including large integers. Nodes navigate to source; two levels start expanded.

JSONL/NDJSON validate nonempty physical lines independently, with a windowed record list and separate details. Invalid records do not invalidate others. Structure errors retain source and diagnostics.

| Budget           | Default   |
| ---------------- | --------- |
| maxDepth         | 256       |
| maxNodes         | 200,000   |
| maxRecords       | 1,000,000 |
| maxCachedRecords | 3         |
| maxCachedNodes   | 200,000   |

initialMode: 'source' defers structure scanning. Source lines longer than 65,536 UTF-16 code units skip coloring while preserving readable content.

## Markdown

Reading, outlines and code highlighting are enabled by default. Supported content includes headings, lists, GFM tables, tasks, strikethrough, quotes, code and source. Tables fill the reading area, code blocks scroll horizontally, and tasks do not duplicate bullets or raw [ ] markers.

Controlled HTML includes br, table, a, img, headings, inline formatting and details. Tags, attributes and local styles are restricted; scripts, event handlers, global styles and embedded pages are excluded. HTML headings and custom anchors participate in navigation. Tags inside code remain literal. Math, Mermaid and editing are not included.

Relative resources resolve against the remote document URL or explicit baseUrl. A local File cannot automatically read neighboring files; provide resolveResource mappings. Images load when visible and follow protocol and lifecycle constraints.

Existing marked and highlight.js dependencies provide parsing and highlighting. Visible code blocks load only the necessary language; maxHighlightChars defaults to 65,536. Unknown, disabled or oversized code stays plain. HTML rendering loads only for real HTML tokens.

## CSV / TSV

The first row is a header by default. TSV uses Tab; CSV detects comma, semicolon, Tab or pipe. Delimiter changes, resizable columns, rectangular selection and complete TSV copy are supported. Values remain readonly strings; formulas do not execute. Rows and columns are windowed, and parsing diagnostics retain source.

CSV/TSV remain a separate package. Their grid and Office's Excel grid share lightweight interactions through @filumo/dom/grid, while keeping parsers and renderers independent. Shift selection, keyboard navigation, Ctrl/Cmd+A, Ctrl/Cmd+C, temporary column widths and reset actions follow the same rules. Successful search navigation updates the active cell; ordinary scrolling preserves selection, and Tab may leave the grid at data boundaries.

Copy is limited to 100000 cells and an estimated 8 MiB of serialized UTF-16 text. Cancellation and overflow never write partial clipboard results. CSV copies full field strings; Excel copies formatted display text with empty placeholders for covered merged cells. Excel retains its own merged/frozen/hidden layout and image/chart anchors. Column overrides only affect the current preview. The shared module loads with the format view; external styles continue using @filumo/dom/styles.css.

| Budget             | Default   |
| ------------------ | --------- |
| maxRows            | 1,000,000 |
| maxColumns         | 4,096     |
| maxCachedCells     | 20,000    |
| cellCacheBytes     | 4 MiB     |
| maxCellDetailChars | 65,536    |

Detail truncation does not truncate the original field copied to the clipboard.

## XML

XML handles explicitly identified XML, not SVG. Source and structure start equally split and are resizable. Namespaces, attributes, mixed text, CDATA, comments and processing instructions are represented; whitespace-only text is hidden by default. Names, values and annotations use distinct colors. Attribute and text values remain strings.

Defaults are initialMode: 'tree', maxDepth: 256 and maxNodes: 200000. DOCTYPE produces a diagnostic without fetching external entities. Source-only mode defers structural parsing.

## Code

<!-- filumo-code-catalog:start -->

### Code and development files · @filumo/code

| Group                           | Extensions                                                                                                                                                             | Filenames and variants                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| JavaScript, TypeScript and HTML | `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`, `.html`, `.htm`                                                                                          | -                                                                         |
| Stylesheets                     | `.css`, `.less`, `.scss`, `.sass`                                                                                                                                      | -                                                                         |
| Shell, PowerShell and Batch     | `.sh`, `.bash`, `.zsh`, `.ps1`, `.psm1`, `.psd1`, `.bat`, `.cmd`                                                                                                       | -                                                                         |
| Other programming languages     | `.py`, `.pyw`, `.sql`, `.java`, `.c`, `.h`, `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx`, `.cs`, `.go`, `.rs`, `.php`, `.rb`, `.rake`, `.kt`, `.kts`, `.swift`, `.lua` | -                                                                         |
| Configuration and environment   | `.yaml`, `.yml`, `.toml`, `.env`                                                                                                                                       | `.env`, `.env.*`                                                          |
| Build, protocols and patches    | `.dockerfile`, `.mk`, `.cmake`, `.graphql`, `.gql`, `.proto`, `.diff`, `.patch`                                                                                        | `Dockerfile`, `Makefile`, `GNUmakefile`, `CMakeLists.txt`, `Dockerfile.*` |

Source is the default. HTML/HTM can switch to controlled static reading; scripts and external stylesheets do not execute or affect the host. Dedicated formats such as JSON and XML retain priority. Vue/Svelte mixed syntax is not included.

<!-- filumo-code-catalog:end -->

Filename and extension rules determine the default language; .h defaults to C and can be switched to C++.

Highlighting runs only in a dedicated Worker with language-specific highlight.js imports; Sass uses lightweight local rules. Defaults are 262,144 characters, 100,000 decoration ranges and 5,000ms. Disabled/unavailable Workers, failures, timeouts and budget limits retain searchable plain source instead of synchronous main-thread highlighting.

## Deployment and resource budgets

New integrations use decoding, TextContent, line indexes, search and tasks from @filumo/core/text, and source views from @filumo/dom/text. DOM also exposes text-messages, text-highlight, outline and split. Legacy Text reader/view entries retain compatibility exports.

External mode loads DOM and active-format CSS, without additional Text styles for JSON/XML source views. Manual Worker deployment preserves each package's worker.js and worker-chunks; Vite uses worker: { format: 'es' }. Code's Worker-only highlighting differs from Office's automatic parsing fallback.

Search retains at most 10,000 matches. Windowing bounds DOM work, not total decoded-source, index and structure memory. Set resourcePolicy.maxFileBytes and format budgets, then validate representative files.
