# @filumo/pdf

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Continuous-scroll PDF viewer plugin for Filumo, with virtualized pages, outlines, thumbnails, text search and bounded canvas caches.

A read-only continuous-scroll PDF plugin using a pinned PDF.js version. Pages scroll continuously while page DOM, Canvas, text layers and thumbnails are managed within a window.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Provides continuous scrolling, outline navigation and tracking, thumbnails, text search, page navigation and rotation.
- The root entry only registers descriptors; the engine and Worker load when a PDF is actually opened.
- Includes resource URL resolution for the same engine version without a default external CDN. Memory budgets cover only resources managed by the viewer.

## Installation

```sh
pnpm add @filumo/dom @filumo/pdf
```

Or with npm:

```sh
npm install @filumo/dom @filumo/pdf
```

## Minimal integration

```html
<div id="viewer"></div>
<button id="dispose" type="button">Close preview</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { pdf } from '@filumo/pdf';

const container = document.getElementById('viewer');
if (!container) throw new Error('Preview container is missing');

const viewer = createViewer(container, {
  plugins: [pdf()],
  height: 640,
  locale: 'en-US',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open('/files/example.pdf');
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

| Option                      | Default                      | Description                                                                             |
| --------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `assetsBaseUrl`             | Bundled resource integration | Optional root for a complete external resource set; unnecessary for normal integration. |
| `cMapUrl`                   | Bundled compressed CMaps     | Optional character-map directory override.                                              |
| `standardFontDataUrl`       | Bundled standard fonts       | Optional font directory override.                                                       |
| `wasmUrl`                   | Bundled WASM and JS fallback | Optional decoder resource directory override.                                           |
| `iccUrl`                    | Bundled ICC                  | Optional color-profile directory override.                                              |
| `useWasm`                   | true                         | false explicitly disables WASM while retaining available JS image-decoder fallbacks.    |
| `workerSrc / workerFactory` | Bundled module Worker URL    | Overrides the Worker URL or factory; must match the current PDF.js engine version.      |
| `renderConcurrency`         | 2                            | Concurrent page renders.                                                                |
| `maxDpr`                    | 2                            | Maximum device pixel ratio used for Canvas rendering.                                   |
| `maxCanvasPixels`           | 8,388,608                    | Pixel budget for one Canvas.                                                            |
| `canvasCacheBytes`          | 96 MiB                       | Canvas cache budget managed by the current viewer.                                      |
| `textCacheBytes`            | 16 MiB                       | Estimated text cache budget.                                                            |
| `maxSearchMatches`          | 10,000                       | Maximum retained search matches.                                                        |
| `onHyperlinkActivate`       | Unset                        | External-link callback receiving a URL string.                                          |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Default resources and host overrides

Use `pdf()` for normal integration. The default engine loads through a dynamic module import; the bundled Worker uses `new Worker(new URL(..., import.meta.url))`. A matching resource manifest resolves CMaps, standard fonts, WASM, ICC and decoder fallback files. Default text-layer styles come from a lazy module. Hosts do not need to copy a full static directory for default configuration.

Registering a plugin neither creates a Worker nor downloads all auxiliary resources. Emitting resources in build output does not mean they are all requested initially. Fonts, character maps and decoding data are fetched as required by the PDF content. There is no default public CDN or silent CDN fallback.

| Option                    | Default behavior                      | Host override                                                                                                           |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| assetsBaseUrl             | Bundled integration                   | Root of a complete matching resource set, preserving external engine, Worker, auxiliary resources and text-layer styles |
| cMapUrl                   | Bundled compressed CMaps              | Override the CMap directory using bcmap files matching cMapPacked: true                                                 |
| standardFontDataUrl       | Bundled standard fonts                | Override the standard font directory                                                                                    |
| wasmUrl                   | Bundled WASM and matching JS fallback | Override decoder resources, including matching fallback scripts                                                         |
| iccUrl                    | Bundled ICC                           | Override the color-profile directory                                                                                    |
| workerSrc / workerFactory | Bundled adapted Worker                | Custom Worker URL or factory; the factory takes precedence                                                              |
| useWasm                   | true                                  | false explicitly disables WASM and uses available JavaScript image-decoder fallbacks                                    |

Resource precedence is **individual directory override > assetsBaseUrl subdirectory > bundled defaults**. Omitting a URL does not disable a resource. Blank strings, invalid protocols and non-boolean useWasm values produce explicit errors. Relative overrides resolve against the host page baseURI; directory URLs receive a trailing slash.

```ts
const plugins = [
  pdf({
    cMapUrl: '/custom-pdf/cmaps/',
    standardFontDataUrl: '/custom-pdf/fonts/',
    wasmUrl: '/custom-pdf/wasm/',
    iccUrl: '/custom-pdf/iccs/',
    useWasm: true,
  }),
];
```

All options above are optional overrides. If only one is changed, other resource categories retain their defaults.

## Advanced: deploying a complete external resource set

Only when the host explicitly chooses a separate resource directory should it copy the contents of `@filumo/pdf/dist/assets/pdfjs/` to a public directory, preserving structure, and configure `pdf({ assetsBaseUrl: '/filumo-pdf/' })`. Do not copy only a Worker. The directory includes the engine, Worker, CMaps, fonts, WASM, ICC, text-layer CSS, LICENSE and NOTICE.

The engine, Worker, auxiliary resources and decoder fallbacks must match the pinned pdfjs-dist 6.4.299. Hosts explicitly configure custom CDNs and must satisfy CORS/CSP; cross-origin Workers also follow browser origin restrictions. Restoring directory query parameters requires this package's adapted Worker. When using a native PDF.js Worker directly, provide a complete ordinary resource directory it can access; it cannot interpret bundled virtual resource identifiers.

The documentation site, smoke page and default examples use the same bundled resource path without a public/filumo-assets/pdf copy fallback. FILUMO_DOCS_BASE still controls the site subdirectory; the bundler determines final resource URLs.

Compatibility of default integration must be established from published artifacts running in Vite development/production, Webpack/dumi and subdirectory deployments. Source changes alone are not evidence of successful host integration; consult validation records for the relevant version.

## Reading and performance limits

Canvas, text layers, thumbnails and page DOM are windowed rather than retaining every page bitmap. Cache budgets are not total process memory limits; PDF engine and browser overhead are separate. Scanned PDFs can display images, but pages without text cannot be searched without OCR, which is not included. Editing and conversion are also outside scope. Encrypted documents require a valid password, with support depending on the engine and file.

## Styles and runtime environment

The default auto mode loads styles with the active view, normally without manual CSS imports. If the host chooses `stylePolicy: { mode: 'external' }`, load matching external styles before creating the viewer:

```ts
import '@filumo/dom/styles.css';
import '@filumo/pdf/styles.css';
```

External style mode only changes how CSS is supplied. Default PDF engine and auxiliary resource integration still apply; copying the full resource set is required only for an assetsBaseUrl deployment.

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry             | Purpose                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `@filumo/pdf`            | pdf factory and public option types                                                                       |
| `@filumo/pdf/styles.css` | Precompiled stylesheet for external style mode                                                            |
| `@filumo/pdf/assets`     | resolvePdfAssets URL resolution, createPdfWorker and PdfAssetLocations; importing alone creates no Worker |
| `@filumo/pdf/worker.js`  | Module Worker asset; preserve related chunks during deployment, not a regular function import             |
| `@filumo/pdf/assets/*`   | PDF.js distribution assets for build copying and deployment                                               |

Unlisted internal paths are not stable public APIs. Standalone format packages do not depend on React/Vue adapters; install only the formats and adapter your host needs.

## Filumo packages

The current package is bold. Each package is published independently. Package names link to npm, and source links point to this repository.

<!-- filumo-packages:start -->

| Package (npm)                                                      | Purpose                                                                 | Source documentation                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | Headless sources, plugin contracts, sessions and shared text utilities  | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | Native DOM viewer, toolbars, source views, outlines and shared UI       | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | Standard preset and factories for nine format plugins                   | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.md)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word, Excel, PowerPoint and supported legacy formats                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.md)   |
| **[@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)**       | Continuous PDF reading, outlines, thumbnails and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.md)      |
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

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/pdf/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/LICENSE)
