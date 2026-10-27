# @filumo/core

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Headless document sessions, file sources and plugin protocols for Filumo, with DOM-free text utilities.

The headless foundation for Filumo: document sources, format detection, plugin contracts, cancellation and session cleanup. Shared text utilities are available on demand from a separate subpath.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- The core entry creates no DOM, viewer or format engine, making it suitable for custom hosts and protocol integrations.
- Supports local File/Blob objects, bytes, URLs and custom sources. Source leases manage range reads, budgets and cancellation.
- Registered text fallback is attempted only after all regular format detection fails. A parser error after a format has claimed the file is not passed to another format.

## Installation

```sh
pnpm add @filumo/core @filumo/text
```

Or with npm:

```sh
npm install @filumo/core @filumo/text
```

## Minimal integration

```ts
import { createDocumentController } from '@filumo/core';
import { text } from '@filumo/text';

const controller = createDocumentController({
  plugins: [text({ worker: 'never' }).document],
  resourcePolicy: { maxFileBytes: 2 * 1024 * 1024 },
});

try {
  await controller.open(new File(['First line\nSecond line'], 'example.txt'));
  console.log(controller.getSnapshot().status);
} finally {
  await controller.destroy();
}
```

## Common options

| Option                        | Default              | Description                                                                                     |
| ----------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `plugins`                     | Required             | DocumentPlugin descriptors, available through a format factory's .document property.            |
| `pluginId`                    | Automatic detection  | Explicitly selects a registered plugin without implicitly installing one or switching fallback. |
| `baseUrl`                     | Unset                | Base address for resolving relative URLs.                                                       |
| `resourcePolicy.maxFileBytes` | No universal limit   | Maximum bytes read for a document.                                                              |
| `resourcePolicy.timeoutMs`    | No universal timeout | Timeout for a single open operation.                                                            |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Shared text utilities and sources

`@filumo/core/text` provides readText, decodeTextBytes, indexLines, textLineAt, findTextMatches, TextContent and a cancellable Worker task protocol without DOM dependencies. The main entry does not eagerly load all readers.

```ts
import { readText } from '@filumo/core/text';

const abort = new AbortController();
const result = await readText(
  new TextEncoder().encode('First line\nSecond line'),
  {
    signal: abort.signal,
    encoding: 'auto',
  },
);
if (result.kind === 'ready') {
  console.log(result.document.lineStarts.length);
}
```

A minimal `DocumentSource` implements readAll(signal) and dispose(), with optional readBlob, readRange and getRangeReader. Local File/Blob sources reuse the original Blob where possible. Efficient HTTP range reads require actual 206 responses and valid Content-Range headers; an existing readRange method alone does not prove efficient chunking. Full-read fallback reuses the same source cache.

FilumoError.code identifies stable error semantics; normal cancellation may produce AbortError. Input changes, timeouts and destruction cancel previous tasks. Custom sources must respect the signal and release their own resources.

## Styles and boundaries

Core has no stylesheets, UI or format engines. The example above reads session state without rendering a document. A DOM-free core does not mean every format driver runs on every Node.js version; each format package documents browser requirements. String input is a URL; use File/Blob or bytes for document content.

Use DOM or a framework adapter when you need a viewer. DocumentPlugin and ViewerPlugin, which includes loadView, serve different contracts.

## Inputs and runtime environment

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry        | Purpose                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `@filumo/core`      | createDocumentController, createSession, normalizeSource, FilumoError and source/plugin/session types |
| `@filumo/core/text` | DOM-free decoding, indexing, search and task protocols                                                |

Unlisted internal paths are not stable public APIs. Standalone format packages do not depend on React/Vue adapters; install only the formats and adapter your host needs.

## Filumo packages

The current package is bold. Each package is published independently. Package names link to npm, and source links point to this repository.

<!-- filumo-packages:start -->

| Package (npm)                                                      | Purpose                                                                 | Source documentation                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **[@filumo/core](https://www.npmjs.com/package/@filumo/core)**     | Headless sources, plugin contracts, sessions and shared text utilities  | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.md)     |
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
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 adapter                                                     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3 (>=3.3 <4) adapter                                                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2 (^2.6.14 or ^2.7.16) adapter                                      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.md)     |
| [@filumo/archive](https://www.npmjs.com/package/@filumo/archive)   | Archive directories, on-demand extraction and child previews            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.md)  |

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/core/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/LICENSE)
