# @filumo/dom

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Framework-independent DOM file viewer shell for Filumo, with toolbars, shared text surfaces, outlines and style management.

The native DOM rendering shell for Filumo manages containers, toolbars, format capabilities and style leases. Explicitly registered plugins provide format parsing.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Framework-independent: native applications can call createViewer without React or Vue.
- Exposes toolbar capabilities for the active format, with light/dark themes, locale, zoom, watermarks and custom height.
- Shared source views, outlines, structure labels and split-pane dragging have separate public entries, so reusing UI does not require a particular format package.

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

| Option                     | Default               | Description                                                                                                          |
| -------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `plugins`                  | Required              | ViewerPlugin list; installing the shell does not register formats automatically.                                     |
| `height`                   | 560                   | Numbers are pixels; CSS height strings are also accepted. Percentage heights require a parent with a defined height. |
| `theme / locale`           | light / zh-CN         | Theme and interface language; zh-CN and en-US are supported.                                                         |
| `toolbar`                  | true                  | Whether to display the toolbar.                                                                                      |
| `zoom`                     | Initialized by format | Initial zoom percentage; supported bounds depend on the active format.                                               |
| `watermark`                | Unset                 | Watermark text in the read-only content area.                                                                        |
| `stylePolicy.mode / nonce` | auto / unset          | Automatic style leases or external CSS; nonce applies to automatic styles.                                           |
| `resourcePolicy`           | Unset                 | Shared maxFileBytes and timeoutMs limits.                                                                            |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Lifecycle and shared UI

viewer.open(input, { pluginId }) opens a file; update changes view options; setActive(false) deactivates the view; getCapabilities / subscribeCapabilities read and observe operations for the current format. Call destroy() when finished instead of only removing the host DOM.

`@filumo/dom/text` provides mountTextSurface without fetching bytes or selecting formats. The underlying text surface hides line numbers by default; Text, JSON, XML and Code enable actual line numbers at the format layer. Hosts combining decoding and UI should also install @filumo/core directly, read via @filumo/core/text, call mountTextSurface(container, model, options), and finally surface.dispose().

`@filumo/dom/outline` provides OutlineTree, connector lines, keyboard navigation and optional renderLabel. `@filumo/dom/split` provides SplitHandle; its owner manages update, setActive and dispose. Do not import internal src files.

`@filumo/dom/grid` provides read-only grid interaction: GridInteractionController, GridColumnResize, GridSelection and format adapter contracts. CSV/TSV and the Office Excel view share selection, keyboard navigation, copying and temporary column widths while keeping separate parsers and renderers. The subpath loads with format views and does not create a grid during plugin registration.

Adapters provide zero-based source coordinates, body bounds, geometric hit testing, visible ranges and range-based text iteration; the shared module does not require a complete workbook. Owners manage setActive/dispose and preserve each format's data semantics. Copying defaults to a maximum of 100000 cells and an estimated 8 MiB of serialized UTF-16 text; failure or cancellation returns no partial result. Styles follow the existing auto/external policy. External mode uses @filumo/dom/styles.css and needs no separate grid stylesheet package.

## Styles and CSP

The default auto mode loads styles with the active view and shares leases within a Document. Manual CSS imports are normally unnecessary. In external mode, load DOM and the required format styles before creating the viewer, for example:

This example also imports the image package stylesheet, so declare it as a direct dependency:

```sh
pnpm add @filumo/image
```

```ts
import '@filumo/dom/styles.css';
import '@filumo/office/styles.css';
import '@filumo/image/styles.css';
```

Image CSS supports the shared Office image overlay. External styles must match each package version. Auto mode accepts a nonce but does not replace host CSP configuration. This package has no default format and does not silently load unregistered formats.

## Inputs and runtime environment

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry                 | Purpose                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `@filumo/dom`                | createViewer, viewer contracts, capability types and style lease functions              |
| `@filumo/dom/outline`        | OutlineTree and shared structure-tree contracts                                         |
| `@filumo/dom/styles.css`     | Precompiled stylesheet for external style mode                                          |
| `@filumo/dom/text`           | mountTextSurface, TextViewport, TextFindBar, text decorations and view types            |
| `@filumo/dom/text-messages`  | Lightweight encoding error messages without importing the source view                   |
| `@filumo/dom/text-highlight` | Shared conversion from highlighting output to safe text decorations                     |
| `@filumo/dom/split`          | SplitHandle and split-pane dragging contracts                                           |
| `@filumo/dom/grid`           | Read-only grid selection, keyboard, copying, column widths and format adapter contracts |

Unlisted internal paths are not stable public APIs. Standalone format packages do not depend on React/Vue adapters; install only the formats and adapter your host needs.

## Filumo packages

The current package is bold. Each package is published independently. Package names link to npm, and source links point to this repository.

<!-- filumo-packages:start -->

| Package (npm)                                                      | Purpose                                                                 | Source documentation                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | Headless sources, plugin contracts, sessions and shared text utilities  | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.md)     |
| **[@filumo/dom](https://www.npmjs.com/package/@filumo/dom)**       | Native DOM viewer, toolbars, source views, outlines and shared UI       | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | Standard preset and factories for nine format plugins                   | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.md)   |
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

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/dom/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/LICENSE)
