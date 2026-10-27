# @filumo/react

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

React 18 and 19 document viewer adapter for Filumo, with typed refs, plugin-based formats and managed viewer cleanup.

A thin Filumo adapter for React 18/19. React manages only the host node; the shared DOM viewer and plugins provide format capabilities and reading interaction.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Exports DocumentViewer and types such as ViewerHandle without default format plugins.
- Manages creation, source updates and unmount cleanup automatically. The ref exposes public handle methods including open, update, setActive and destroy.
- Keep the plugin array reference stable to avoid rebuilding the viewer during ordinary parent renders.

## Installation

```sh
pnpm add @filumo/react @filumo/office
```

Or with npm:

```sh
npm install @filumo/react @filumo/office
```

Use the example in a host project already configured for the corresponding framework. Supported framework versions are listed below.

## Minimal integration

```tsx
'use client';

import { useState } from 'react';
import { DocumentViewer } from '@filumo/react';
import { office } from '@filumo/office';

const plugins = [office()];

export default function OfficePreview() {
  const [file, setFile] = useState<File>();
  return (
    <section>
      <input
        type="file"
        accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx"
        onChange={(event) => setFile(event.target.files?.[0])}
      />
      <DocumentViewer
        source={file}
        plugins={plugins}
        options={{ height: 640 }}
        onError={(error) => console.error(error)}
      />
    </section>
  );
}
```

## Common options

| Option                                 | Default                     | Description                                                                                         |
| -------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| `source`                               | Optional                    | Document inputs such as File, Blob or URL; updates are opened by the adapter.                       |
| `plugins`                              | Required                    | Stable ViewerPlugin array without implicit default formats.                                         |
| `options`                              | Default shell configuration | ViewerConfiguration: height, theme, locale, resourcePolicy, stylePolicy and more.                   |
| `className`                            | Unset                       | CSS class for the host container.                                                                   |
| `onReady / onError`                    | Unset                       | Session-ready or error callbacks; onReady does not mean every image or page has finished rendering. |
| `onStateChange / onCapabilitiesChange` | Unset                       | Observe loading state and toolbar capabilities of the current format.                               |
| `ref`                                  | Optional                    | ViewerHandle; methods requiring an instance cannot be called before mounting.                       |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Lifecycle, refs and React versions

The peer dependency is react >=18 <20. The example assumes an existing React application with a compatible renderer. Unmounting destroys the instance; source changes open a new input. onReady reports session delivery, not completion of all image or page rendering.

Import ViewerHandle from @filumo/react and wait for mounting before calling ref methods; open rejects before mounting. Use a module-level constant or useMemo for plugins to avoid viewer reconstruction on ordinary renders. SSR/Next.js hosts should mount on the client instead of parsing browser files or drawing Canvas on the server.

## Format selection and styles

The example registers only Office. For the full preset, install @filumo/viewer directly and pass its standardPlugins array to plugins. The adapter does not silently add formats. PDF uses bundled resources by default; only custom external deployment requires resource directory overrides.

DOM and format packages own automatic styles. External mode loads @filumo/dom/styles.css and the actual format styles.css; Office image overlays also need Image CSS. React has no separate styles.css, and the adapter owns unmount cleanup.

## Inputs and runtime environment

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry    | Purpose                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `@filumo/react` | DocumentViewer and types including DocumentInput, ViewerHandle and ViewerConfiguration |

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
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | CSV / TSV read-only grids, virtual scrolling and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | XML source, namespace-aware structure trees and node navigation         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.md)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | Read-only highlighting for code, scripts, configuration and stylesheets | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.md)     |
| **[@filumo/react](https://www.npmjs.com/package/@filumo/react)**   | React 18/19 adapter                                                     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3 (>=3.3 <4) adapter                                                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2 (^2.6.14 or ^2.7.16) adapter                                      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.md)     |
| [@filumo/archive](https://www.npmjs.com/package/@filumo/archive)   | Archive directories, on-demand extraction and child previews            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.md)  |

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/react/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/LICENSE)
