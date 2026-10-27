# @filumo/text

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Read-only plain text and log viewer for Filumo, with encoding detection, line numbers, search and readable-text fallback.

A read-only text and log preview plugin with automatic encoding detection, line numbers, wrapping, search and readable-text fallback for unknown formats.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Handles TXT, LOG, INI, CONF, CFG, PROPERTIES and OUT by default; additional explicit text extensions can be configured.
- Detects encoding using BOMs, source charset hints, UTF-16 byte patterns, strict UTF-8 and GB18030. Manual choices include UTF-8, UTF-16LE/BE, GBK and GB18030.
- Shows actual line numbers and wraps by default. Text fallback runs only when no dedicated plugin matches; parsing failures of matched formats are not swallowed.

## Installation

```sh
pnpm add @filumo/dom @filumo/text
```

Or with npm:

```sh
npm install @filumo/dom @filumo/text
```

## Minimal integration

```html
<div id="viewer"></div>
<button id="dispose" type="button">Close preview</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { text } from '@filumo/text';

const container = document.getElementById('viewer');
if (!container) throw new Error('Preview container is missing');

const viewer = createViewer(container, {
  plugins: [text()],
  height: 640,
  locale: 'en-US',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open(new File(['First line\nSecond line'], 'example.txt'));
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

| Option                   | Default                 | Description                                                                                   |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| `encoding`               | auto                    | Automatic detection or explicit encoding; BOM-free inference may need manual correction.      |
| `fallback`               | true                    | Whether to detect readable text in unknown formats after all dedicated plugins fail to match. |
| `lineNumbers`            | true                    | Displays actual line numbers; can be toggled in More.                                         |
| `wrap`                   | true                    | Enables automatic line wrapping.                                                              |
| `extensions`             | Default text extensions | Adds directly recognized text suffixes; does not enable execution of HTML/XML.                |
| `worker / workerFactory` | auto / bundled Worker   | Parsing execution strategy and Worker factory.                                                |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Encoding, source text and fallback

Automatic encoding detection uses BOMs, source charset hints, clear UTF-16 byte patterns, strict UTF-8 and GB18030. Without a declaration it is an inference, not proof of a unique interpretation. A failed manual change preserves the visible content and offers retry without downloading the source again.

Unknown formats undergo bounded detection and a complete readability check only after all dedicated plugins fail to match. Common binary files are not treated as text solely because their extension is unknown; uncertain files report unsupported format. HTML/XML remain literal text in this package. To select Text explicitly, use the registered pluginId: 'text'.

Ordinary INI/CONF/CFG/Properties files belong to Text. Explicit code filenames such as CMakeLists.txt, Dockerfile and .env variants remain available for Code detection. Install the respective plugins for Markdown, JSON and XML rendering.

## Shared utilities and line numbers

New code reusing decoding, indexing or search should depend directly on @filumo/core/text; shared text UI comes from @filumo/dom/text. This package's reader/view entries are compatibility paths, not a foundation for other format packages.

Source rendering is limited to visible lines and shows only actual line numbers by default. The gutter background continues below the last line without adding fictitious content. Line numbers, wrapping and search are available in the More menu; these controls do not change original download bytes. Editing, saving and code syntax highlighting are not included.

## Styles and runtime environment

The default auto mode loads styles with the active view, normally without manual CSS imports. If the host chooses `stylePolicy: { mode: 'external' }`, load matching external styles before creating the viewer:

```ts
import '@filumo/dom/styles.css';
import '@filumo/text/styles.css';
```

When deploying module Workers, preserve the relative layout of worker.js and worker-chunks. Use workerFactory if the bundler cannot handle it automatically. Auto selects execution based on the environment, always requires an available Worker, and never uses the package's supported non-Worker path. Code highlighting has a separate boundary documented in the Code package; it does not repeat the enhancement on the main thread.

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry              | Purpose                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `@filumo/text`            | text factory and public option types                                                          |
| `@filumo/text/reader`     | Compatibility text reader; prefer @filumo/core/text for new shared integrations               |
| `@filumo/text/view`       | Compatibility source view; prefer @filumo/dom/text for new shared integrations                |
| `@filumo/text/styles.css` | Precompiled stylesheet for external style mode                                                |
| `@filumo/text/worker.js`  | Module Worker asset; preserve related chunks during deployment, not a regular function import |

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
| **[@filumo/text](https://www.npmjs.com/package/@filumo/text)**     | Plain text, logs, encoding detection and readable-text fallback         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.md)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON / JSONC / JSONL / NDJSON source and structure views                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.md)     |
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

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/text/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/LICENSE)
