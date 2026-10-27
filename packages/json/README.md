# @filumo/json

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Read-only JSON, JSONC and JSON Lines viewer for Filumo, with split source/tree views, duplicate-key preservation and source navigation.

A read-only structured preview plugin for JSON, JSONC, JSONL and NDJSON, with colored source, structure trees, node navigation and record-based reading.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Wide containers show source on the left and structure on the right with a draggable split; narrow containers show one region according to mode.
- JSON uses strict syntax; JSONC accepts comments and trailing commas. Original number text and duplicate properties are preserved, and source remains readable if structure parsing fails.
- JSONL/NDJSON first builds a record index. Errors appear per record, and a bounded details cache avoids materializing all structures at once.
- Source shows actual line numbers by default, with a toggle in More. Zoom, view changes and re-decoding retain the line-number preference within the same file.

## Installation

```sh
pnpm add @filumo/dom @filumo/json
```

Or with npm:

```sh
npm install @filumo/dom @filumo/json
```

## Minimal integration

```html
<div id="viewer"></div>
<button id="dispose" type="button">Close preview</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { json } from '@filumo/json';

const container = document.getElementById('viewer');
if (!container) throw new Error('Preview container is missing');

const viewer = createViewer(container, {
  plugins: [json()],
  height: 640,
  locale: 'en-US',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open(
    new File(['{"name":"Filumo","items":[1,2]}'], 'example.json'),
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

| Option                              | Default               | Description                                                                         |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `variant`                           | auto                  | Detects json / jsonc / lines from the source, or selects one explicitly.            |
| `initialMode`                       | tree                  | tree: split view in wide containers, structure in narrow ones; source: source only. |
| `initialExpandDepth`                | 2                     | Initial structure-tree expansion depth.                                             |
| `maxDepth / maxNodes`               | 256 / 200,000         | Structure depth and node budgets.                                                   |
| `maxRecords`                        | 1,000,000             | JSONL/NDJSON record-index limit.                                                    |
| `maxCachedRecords / maxCachedNodes` | 3 / 200,000           | Recent record detail cache budgets.                                                 |
| `encoding`                          | auto                  | Decoding for source bytes.                                                          |
| `worker / workerFactory`            | auto / bundled Worker | Task execution strategy and Worker factory.                                         |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Structure and source semantics

Duplicate properties and long integers preserve source semantics instead of first converting to ordinary JavaScript objects that lose duplicate keys. JSON remains strict; comments and trailing commas require detected or explicitly selected jsonc mode. JSON5, JSON Schema validation, editing and saving are not supported.

JSONL details use record-local positions, converted through the index for whole-file navigation. A malformed record does not erase other records. Hidden regions load on demand; source and diagnostics remain available when structure budgets are exceeded. The More menu line-number toggle applies to JSON, JSONC, complete JSONL source and record source.

## External stylesheet requirements

Shared source and structure UI comes from DOM. External mode needs only DOM and JSON styles; **installing or importing @filumo/text/styles.css is unnecessary**.

## Styles and runtime environment

The default auto mode loads styles with the active view, normally without manual CSS imports. If the host chooses `stylePolicy: { mode: 'external' }`, load matching external styles before creating the viewer:

```ts
import '@filumo/dom/styles.css';
import '@filumo/json/styles.css';
```

When deploying module Workers, preserve the relative layout of worker.js and worker-chunks. Use workerFactory if the bundler cannot handle it automatically. Auto selects execution based on the environment, always requires an available Worker, and never uses the package's supported non-Worker path. Code highlighting has a separate boundary documented in the Code package; it does not repeat the enhancement on the main thread.

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry              | Purpose                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `@filumo/json`            | json factory and public option types                                                          |
| `@filumo/json/styles.css` | Precompiled stylesheet for external style mode                                                |
| `@filumo/json/worker.js`  | Module Worker asset; preserve related chunks during deployment, not a regular function import |

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
| **[@filumo/json](https://www.npmjs.com/package/@filumo/json)**     | JSON / JSONC / JSONL / NDJSON source and structure views                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.md)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown reading, outlines, GFM layout and code highlighting            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.md) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | CSV / TSV read-only grids, virtual scrolling and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | XML source, namespace-aware structure trees and node navigation         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.md)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | Read-only highlighting for code, scripts, configuration and stylesheets | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 adapter                                                     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3 (>=3.3 <4) adapter                                                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2 (^2.6.14 or ^2.7.16) adapter                                      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.md)     |
| [@filumo/archive](https://www.npmjs.com/package/@filumo/archive)   | Archive directories, on-demand extraction and child previews            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.md)  |

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/json/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/LICENSE)
