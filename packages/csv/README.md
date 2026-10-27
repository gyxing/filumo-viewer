# @filumo/csv

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Read-only CSV and TSV table viewer for Filumo, with delimiter detection, virtualized rows and columns, search and source view.

A read-only CSV/TSV grid plugin with delimiter/header selection, row and column virtualization, search, cell details and source reading.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Supports commas, semicolons, tabs, pipes and automatic detection. TSV defaults to tabs.
- Supports quoted fields, embedded line breaks and escaped quotes. Cells remain source strings without automatic number, date or formula inference.
- Rows and columns render within the visible area with bounded cell caches. Long cells can be inspected separately without inserting the entire grid into DOM.

## Installation

```sh
pnpm add @filumo/dom @filumo/csv
```

Or with npm:

```sh
npm install @filumo/dom @filumo/csv
```

## Minimal integration

```html
<div id="viewer"></div>
<button id="dispose" type="button">Close preview</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { csv } from '@filumo/csv';

const container = document.getElementById('viewer');
if (!container) throw new Error('Preview container is missing');

const viewer = createViewer(container, {
  plugins: [csv()],
  height: 640,
  locale: 'en-US',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open(
    new File(['name,value\nFilumo,1\nexample,2'], 'example.csv'),
  );
} catch (error) {
  console.error(error);
}

document.getElementById('dispose')?.addEventListener('click', () => {
  void viewer.destroy();
});
window.addEventListener(
  'pagehide',
  () => {
    void viewer.destroy();
  },
  { once: true },
);
```

Replace sample URLs with accessible files, or pass a File from a file-selection event. Example limits such as 20 MiB are host configuration, not library defaults. Destroy the handle to release sessions, resources and style leases.

## Common options

| Option                            | Default                   | Description                                   |
| --------------------------------- | ------------------------- | --------------------------------------------- |
| `delimiter`                       | auto for CSV, Tab for TSV | auto, comma, semicolon, Tab or pipe.          |
| `header`                          | true                      | Whether the first row is a header.            |
| `initialMode`                     | table                     | table or source.                              |
| `encoding`                        | auto                      | Decoding for CSV/TSV bytes.                   |
| `maxRows / maxColumns`            | 1,000,000 / 4,096         | Indexed row and column budgets.               |
| `maxCachedCells / cellCacheBytes` | 20,000 / 4 MiB            | Cell-cache count and estimated byte budgets.  |
| `maxCellDetailChars`              | 65,536                    | Maximum characters displayed in cell details. |
| `worker / workerFactory`          | auto / bundled Worker     | Grid indexing execution strategy.             |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Data semantics and performance

The grid shares read-only @filumo/dom/grid interaction with Excel: click/drag, Shift extension, arrow keys, Tab, Home/End, PageUp/PageDown, Ctrl/Cmd+A and Ctrl/Cmd+C. Tab can leave the grid at its boundaries. Inputs and search fields retain their own shortcuts.

Column widths affect only the current preview and can be restored from More. Escape or pointer cancellation rolls back the current resize. Closing search returns focus to the grid; normal scrolling preserves selection. Copying uses complete fields and protects TSV delimiters, line breaks and quotes, with defaults of 100000 cells and an estimated 8 MiB of UTF-16 text. Exceeding limits asks users to reduce selection or download the file rather than writing truncated clipboard data.

Fields always remain text, preserving quoting, embedded line breaks and escaping semantics without converting numbers/dates or executing formulas beginning with equals. Search, selection and copying do not modify the source. Source mode retains all decoded content.

A new delimiter replaces the grid only after successful parsing, so failure preserves the current result. Cell caches have both count and byte budgets; this does not guarantee the entire file stays out of memory. CSV editing/saving, Excel workbook parsing and statistical calculation are not included.

## Styles and runtime environment

The default auto mode loads styles with the active view, normally without manual CSS imports. If the host chooses `stylePolicy: { mode: 'external' }`, load matching external styles before creating the viewer:

```ts
import '@filumo/dom/styles.css';
import '@filumo/csv/styles.css';
```

When deploying module Workers, preserve the relative layout of worker.js and worker-chunks. Use workerFactory if the bundler cannot handle it automatically. Auto selects execution based on the environment, always requires an available Worker, and never uses the package's supported non-Worker path. Code highlighting has a separate boundary documented in the Code package; it does not repeat the enhancement on the main thread.

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry             | Purpose                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `@filumo/csv`            | csv factory and public option types                                                           |
| `@filumo/csv/styles.css` | Precompiled stylesheet for external style mode                                                |
| `@filumo/csv/worker.js`  | Module Worker asset; preserve related chunks during deployment, not a regular function import |

Unlisted internal paths are not stable public APIs. Standalone format packages do not depend on React/Vue adapters; install only the formats and adapter your host needs.

## Filumo packages

The current package is bold. Each package is published independently. Package names link to npm, and source links point to this repository.

<!-- filumo-packages:start -->

| Package (npm)                                                      | Purpose                                                                 | Source documentation                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | Headless sources, plugin contracts, sessions and shared text utilities  | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | Native DOM viewer, toolbars, source views, outlines and shared UI       | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | Standard preset and factories for ten format plugins                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.md)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word, Excel, PowerPoint and supported legacy formats                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.md)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | Continuous PDF reading, outlines, thumbnails and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | Image preview, zoom, rotation, panning and shared overlays              | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.md)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | Plain text, logs, encoding detection and readable-text fallback         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.md)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON / JSONC / JSONL / NDJSON source and structure views                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.md)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown reading, outlines, GFM layout and code highlighting            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.md) |
| **[@filumo/csv](https://www.npmjs.com/package/@filumo/csv)**       | CSV / TSV read-only grids, virtual scrolling and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | XML source, namespace-aware structure trees and node navigation         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.md)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | Read-only highlighting for code, scripts, configuration and stylesheets | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 adapter                                                     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3 (>=3.3 <4) adapter                                                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2 (^2.6.14 or ^2.7.16) adapter                                      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.md)     |
| [@filumo/archive](https://www.npmjs.com/package/@filumo/archive)   | Archive directories, on-demand extraction and child previews            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.md)  |

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/csv/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/LICENSE)
