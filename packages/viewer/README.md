# @filumo/viewer

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Standard lazy-loaded Filumo plugin preset for Office, PDF, images, text, Markdown, JSON, CSV, XML, source code and archive previews.

The standard preset and factory aggregation entry for Filumo's ten format plugins. Hosts needing complete format support still create the viewer through DOM or a framework adapter.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- standardPlugins is a read-only plugin array, not a function to call.
- Aggregates Office, Text, JSON, Markdown, Image, PDF, CSV, XML, Code and Archive. Format implementations still load only when their files are opened.
- Installing this package installs all format dependencies. If only some formats are needed, install and register their standalone packages instead.

## Installation

```sh
pnpm add @filumo/dom @filumo/viewer
```

Or with npm:

```sh
npm install @filumo/dom @filumo/viewer
```

## Minimal integration

```html
<div id="viewer"></div>
<button id="dispose" type="button">Close preview</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { standardPlugins } from '@filumo/viewer';

const container = document.getElementById('viewer');
if (!container) throw new Error('Preview container is missing');
const viewer = createViewer(container, {
  plugins: standardPlugins,
  height: 640,
  onError: (error) => console.error(error),
});

try {
  await viewer.open(
    new File(['# Filumo\n\nMulti-format document preview'], 'example.md'),
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

| Option                                                             | Default                        | Description                                                                                       |
| ------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `standardPlugins`                                                  | Read-only array of ten plugins | Pass to createViewer or DocumentViewer plugins; do not call standardPlugins().                    |
| `office / pdf / image / text / json / markdown / csv / xml / code` | Corresponding factory          | Configure individual plugins or replace an instance in the standard array.                        |
| `Viewer configuration`                                             | Provided by the shell          | Pass height, theme, locale and resourcePolicy to DOM or the adapter, not to this package's array. |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Custom presets and loading

standardPlugins is a read-only array, not a function. Installation includes all format dependencies, but importing lightweight descriptors does not eagerly load every engine. Implementations load for the opened format.

To customize PDF resource locations, replace the PDF instance in the standard array instead of registering the same plugin ID twice:

```ts
import { standardPlugins, pdf } from '@filumo/viewer';

const plugins = [
  ...standardPlugins.filter((plugin) => plugin.document.id !== 'pdf'),
  pdf({ assetsBaseUrl: '/filumo-pdf/' }),
];
```

Pass plugins to DOM or an adapter component. The standard pdf() instance uses bundled resources. In the example above, selecting a custom assetsBaseUrl makes the host responsible for deploying that external directory. Install individual packages when only some formats are needed.

## Styles and resources

Each format uses automatic styles by default. External mode loads styles.css from DOM, Office, Text, JSON, Markdown, Image, PDF, CSV, XML, Code and Archive. There is no @filumo/viewer/styles.css entry.

In external mode, declare packages whose styles are imported as direct dependencies instead of relying on hoisting. Default auto integration does not require separately installing each format solely for stylesheet imports.

Preserve each package's worker.js and worker-chunks relative structure. PDF includes matching engine, fonts, CMaps, WASM, ICC and text-layer styles; external overrides are optional advanced configuration. This package provides no editing, saving, OCR or conversion and does not export createViewer, which comes from DOM.

## Inputs and runtime environment

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry     | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `@filumo/viewer` | Read-only standardPlugins array and ten format factories |

Unlisted internal paths are not stable public APIs. Standalone format packages do not depend on React/Vue adapters; install only the formats and adapter your host needs.

## Filumo packages

The current package is bold. Each package is published independently. Package names link to npm, and source links point to this repository.

<!-- filumo-packages:start -->

| Package (npm)                                                      | Purpose                                                                 | Source documentation                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | Headless sources, plugin contracts, sessions and shared text utilities  | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | Native DOM viewer, toolbars, source views, outlines and shared UI       | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.md)      |
| **[@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)** | Standard preset and factories for ten format plugins                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.md)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word, Excel, PowerPoint and supported legacy formats                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.md)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | Continuous PDF reading, outlines, thumbnails and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | Image preview, zoom, rotation, panning and shared overlays              | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.md)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | Plain text, logs, encoding detection and readable-text fallback         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.md)     |
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

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/viewer/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/LICENSE)
