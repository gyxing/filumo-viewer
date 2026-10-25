# @filumo/code

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Read-only source code viewer for Filumo, with lazy syntax highlighting for common languages, scripts, configuration and stylesheet files.

A standalone code preview plugin providing read-only source, highlighting, search and line numbers for common languages, scripts, build files, configuration and stylesheets.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Shows actual line numbers and wraps by default. More provides line-number, wrapping, encoding and language choices.
- Common languages and grammars load on demand. Highlighting runs in a dedicated Worker; readable source remains available when highlighting is unavailable, disabled or over budget.
- Supports extensionless build files and .env variants. HTML, CSS, LESS, SCSS and Sass are displayed as source without execution or application to the page.

## Installation

```sh
pnpm add @filumo/dom @filumo/code
```

Or with npm:

```sh
npm install @filumo/dom @filumo/code
```

## Minimal integration

```html
<div id="viewer"></div>
<button id="dispose" type="button">Close preview</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { code } from '@filumo/code';

const container = document.getElementById('viewer');
if (!container) throw new Error('Preview container is missing');

const viewer = createViewer(container, {
  plugins: [code()],
  height: 640,
  locale: 'en-US',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open(
    new File(
      ['const message: string = "Filumo";\nconsole.log(message);'],
      'example.ts',
    ),
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

| Option                   | Default               | Description                                                                                     |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| `language`               | auto                  | Chooses grammar by filename/extension, or explicitly selects a supported language or plaintext. |
| `encoding`               | auto                  | Source-file decoding.                                                                           |
| `worker / workerFactory` | auto / bundled Worker | never disables highlighting while retaining source preview.                                     |
| `maxHighlightChars`      | 262,144               | Maximum file characters eligible for highlighting.                                              |
| `maxHighlightRanges`     | 100,000               | Highlight-decoration range budget.                                                              |
| `highlightTimeout`       | 5,000ms               | Enhancement timeout before returning to plain source.                                           |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Supported code and configuration

| Category                              | Grammars and files                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| JavaScript / TypeScript               | JS, MJS, CJS, JSX, TS, MTS, CTS, TSX                                                 |
| Markup and stylesheets                | HTML/HTM, CSS, LESS, SCSS, Sass                                                      |
| Scripts and general-purpose languages | Shell/Bash/Zsh, Python, SQL, Java, C, C++, C#, Go, Rust                              |
| Additional languages                  | PHP, Ruby/Rake, Kotlin, Swift, Lua                                                   |
| Configuration and build files         | YAML/YML, TOML, PowerShell, Batch/CMD, Dockerfile, Makefile/GNUmakefile, CMake, .env |
| Interfaces and changes                | GraphQL/GQL, Protocol Buffers, Diff/Patch                                            |

Full filenames such as `Dockerfile.*`, `*.dockerfile`, `.env.*` and `CMakeLists.txt` participate in detection. Dedicated suffixes retain precedence: `.env.json` belongs to JSON. Ordinary INI/CONF/CFG/Properties files remain with Text. The `.h` extension defaults to C highlighting and can be switched manually to C++.

## Highlighting and execution boundaries

Highlighting is enhanced only in a dedicated Worker. worker: 'never', an unavailable Worker, timeouts or budget limits preserve source without repeating the same heavy enhancement on the main thread. Grammars load by language rather than all at once.

TOML reuses the INI grammar; YAML loads the upstream Ruby prerequisite; Dockerfile loads Shell. PHP supports bare code and tagged templates. Variables and commands in .env files are colored without expansion. HTML, CSS, LESS, SCSS and Sass are not executed or applied to the page. Compilers, language servers, formatting, code execution and Vue/Svelte mixed grammars are not included.

## Styles and runtime environment

The default auto mode loads styles with the active view, normally without manual CSS imports. If the host chooses `stylePolicy: { mode: 'external' }`, load matching external styles before creating the viewer:

```ts
import '@filumo/dom/styles.css';
import '@filumo/code/styles.css';
```

When deploying module Workers, preserve the relative layout of worker.js and worker-chunks. Use workerFactory if the bundler cannot handle it automatically. worker: 'never' disables highlighting; other modes try a dedicated Worker. Failure or exceeded budgets retain readable source without running the same enhancement on the main thread.

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry              | Purpose                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `@filumo/code`            | code factory and public option types                                                          |
| `@filumo/code/styles.css` | Precompiled stylesheet for external style mode                                                |
| `@filumo/code/worker.js`  | Module Worker asset; preserve related chunks during deployment, not a regular function import |

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
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | Continuous PDF reading, outlines, thumbnails and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | Image preview, zoom, rotation, panning and shared overlays              | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.md)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | Plain text, logs, encoding detection and readable-text fallback         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.md)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON / JSONC / JSONL / NDJSON source and structure views                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.md)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown reading, outlines, GFM layout and code highlighting            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.md) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | CSV / TSV read-only grids, virtual scrolling and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | XML source, namespace-aware structure trees and node navigation         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.md)      |
| **[@filumo/code](https://www.npmjs.com/package/@filumo/code)**     | Read-only highlighting for code, scripts, configuration and stylesheets | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 adapter                                                     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3 (>=3.3 <4) adapter                                                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2 (^2.6.14 or ^2.7.16) adapter                                      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.md)     |

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/code/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/LICENSE)
