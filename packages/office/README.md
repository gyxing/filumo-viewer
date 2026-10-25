# @filumo/office

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Lazy-loaded read-only Word, Excel and PowerPoint previews for Filumo, supporting DOCX, XLSX, PPTX and legacy Office files.

Native DOM previews for Word, Excel and PowerPoint without requiring React/Vue or server-side conversion.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Word: DOCX, DOCM, DOTX, DOC, WPS; spreadsheets: XLSX, XLSM, XLTX, XLS; presentations: PPTX, PPTM, POTX, PPT.
- Exposes format-specific outlines, search, sheet/slide navigation, tracked changes and comments where available; controls depend on document content.
- Double-click image preview reuses @filumo/image/view on demand. Supports host font aliases, font sources and hyperlink activation callbacks.

## Installation

```sh
pnpm add @filumo/dom @filumo/office
```

Or with npm:

```sh
npm install @filumo/dom @filumo/office
```

## Minimal integration

```html
<div id="viewer"></div>
<button id="dispose" type="button">Close preview</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { office } from '@filumo/office';

const container = document.getElementById('viewer');
if (!container) throw new Error('Preview container is missing');

const viewer = createViewer(container, {
  plugins: [office()],
  height: 640,
  locale: 'en-US',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open('/files/example.docx');
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

| Option                | Default                                     | Description                                                                                      |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `worker`              | auto                                        | auto / always / never; selects parsing execution based on environment.                           |
| `workerFactory`       | Bundled module Worker                       | Overrides Worker creation; preserve worker.js and worker-chunks resources.                       |
| `fonts`               | Built-in fallback                           | Configure fonts through aliases, fallbackFamilies, sources and warnOnMissing.                    |
| `media`               | Not explicitly disabled; external media off | false disables media; allowExternal and download can be configured.                              |
| `onWarning`           | Unset                                       | Receives font, format and parsing warnings; does not establish integration-test success.         |
| `onHyperlinkActivate` | Default link handling                       | Receives a link transaction; call the event's preventDefault for host handling.                  |
| `resourcePolicy`      | Shared and format policies                  | Limits file bytes and timeouts, plus archive entries, decompressed bytes and compression ratios. |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Formats, fonts and resource boundaries

Excel shares read-only @filumo/dom/grid interaction with CSV/TSV: cells and rectangular selections, Shift extension, keyboard navigation, selection copying and temporary column widths. Selections include complete merged areas. Frozen and body regions share logical coordinates, and hidden rows/columns are skipped during keyboard navigation. The viewer does not edit, recalculate formulas or write back to workbooks.

Copying uses formatted display text by default. Merged ranges emit a value only in the anchor cell and empty fields elsewhere. A copy is limited to 100000 cells and an estimated 8 MiB of UTF-16 text; failures or cancellation never write partial results. Width changes update merged cells, frozen regions, wrapping and image/chart anchors. The More menu restores source widths. Manual resizing preserves the current zoom and exits automatic fitting to prevent jumps. Each sheet retains its own selection, reading position and preview widths; reopening starts a new session.

Macro-enabled files preview content without executing macros. Fonts, layout and objects in complex documents depend on the source and browser; pixel equivalence with desktop Office is not guaranteed. Editing, saving, OCR and server-side conversion are not provided.

Configure host fonts with fonts.aliases, fallbackFamilies and sources, deploying font files in the host. Missing glyphs can be reported through onWarning. Image overlays load the shared Image entry on interaction, not during office() registration.

onHyperlinkActivate receives a transaction containing hyperlink, file and previewKind. Call the event's preventDefault to take over navigation. media.allowExternal disallows external media by default; loading follows host policy.

## Styles and runtime environment

The default auto mode loads styles with the active view, normally without manual CSS imports. If the host chooses `stylePolicy: { mode: 'external' }`, load matching external styles before creating the viewer:

The following example directly imports Image styles. Install that package explicitly rather than relying on dependency hoisting:

```sh
pnpm add @filumo/image
```

```ts
import '@filumo/dom/styles.css';
import '@filumo/office/styles.css';
import '@filumo/image/styles.css';
```

When deploying module Workers, preserve the relative layout of worker.js and worker-chunks. Use workerFactory if the bundler cannot handle it automatically. Auto selects execution based on the environment, always requires an available Worker, and never uses the package's supported non-Worker path. Code highlighting has a separate boundary documented in the Code package; it does not repeat the enhancement on the main thread.

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry                | Purpose                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `@filumo/office`            | office factory and public option types                                                        |
| `@filumo/office/styles.css` | Precompiled stylesheet for external style mode                                                |
| `@filumo/office/worker.js`  | Module Worker asset; preserve related chunks during deployment, not a regular function import |

Unlisted internal paths are not stable public APIs. Standalone format packages do not depend on React/Vue adapters; install only the formats and adapter your host needs.

## Filumo packages

The current package is bold. Each package is published independently. Package names link to npm, and source links point to this repository.

<!-- filumo-packages:start -->

| Package (npm)                                                      | Purpose                                                                 | Source documentation                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | Headless sources, plugin contracts, sessions and shared text utilities  | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | Native DOM viewer, toolbars, source views, outlines and shared UI       | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | Standard preset and factories for nine format plugins                   | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.md)   |
| **[@filumo/office](https://www.npmjs.com/package/@filumo/office)** | Word, Excel, PowerPoint and supported legacy formats                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.md)   |
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

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/office/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/LICENSE)
