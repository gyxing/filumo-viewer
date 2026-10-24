---
title: Filumo Developer Documentation
description: Filumo 0.1.0 file previews with fifteen packages, nine format plugins, React and Vue adapters, public APIs and asset deployment.
keywords:
  - Filumo
  - file preview
  - document viewer
  - browser
siteLayout: docs
toc: content
---

# Filumo developer documentation

Filumo is a browser-based, cross-framework file preview library. Parsing, images, charts and rendering run in the browser without a document-conversion service. React, Vue 3, Vue 2 and JavaScript hosts share the native DOM renderer.

> The current workspace version is **0.1.0** and has not been published to npm. The workspace implements nine readonly plugins: Office, PDF, image, text, JSON, Markdown, CSV, XML and code. Editing and saving edited files are future extensions. Do not install unrelated packages with similar names or use the previous package entry points.

<nav className="office-viewer-docs__quick-links" aria-label="Documentation shortcuts">
  <a href="#quick-start">Quick start</a>
  <a href="#viewer-options">Options & events</a>
  <a href="#capabilities">Toolbar & capabilities</a>
  <a href="#office-options">Office options</a>
  <a href="#development">Local development</a>
</nav>

## Packages and lazy loading

| Package                                                            | Responsibility                                                | Source and details                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | Sources, plugin protocol, sessions and shared text processing | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/core#readme)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | DOM shell, toolbar, outline and shared source views           | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/dom#readme)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | Lightweight standard preset for nine format plugins           | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/viewer#readme)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word, Excel, PowerPoint and supported WPS documents           | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/office#readme)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | Continuous PDF reading, thumbnails, outlines and search       | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/pdf#readme)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | Standalone images and shared image overlay interactions       | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/image#readme)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | Plain text, logs and readable-content fallback                | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/text#readme)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON, JSONC, JSONL and NDJSON                                 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/json#readme)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown reading, source, outlines and controlled HTML        | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/markdown#readme) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | Readonly CSV and TSV tables                                   | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/csv#readme)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | Split XML source and structure views                          | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/xml#readme)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | Common source, configuration, script and build files          | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/code#readme)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 adapter                                           | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/react#readme)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue >=3.3 <4 adapter                                          | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/vue#readme)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2.6/2.7 adapter                                           | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/vue2#readme)     |

Install only your framework adapter. JavaScript and Vue hosts do not acquire React through the Office package.

`office()` creates a lightweight descriptor. Drivers and the appropriate format view load when a document opens. Image and PDF deployment is described in the [image and PDF guide](./guides/image-pdf). Unregistered plugins do not load implicitly.

See the [package overview](./guides/packages) for all fifteen packages and installation combinations.\
The standard preset is a frozen readonly array of nine descriptors. It exports no framework component, createViewer or standalone styles.css. Installing it installs every format dependency; engines still load on demand.

## Installation and workspace use

Use the repository's pinned pnpm version for development:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo:react
```

After publication, select your framework adapter and required format packages, or use the @filumo/viewer standard preset. Before publication, use the workspace or locally built and packed packages; see Framework integration in the navigation for the exact process. Packages are ESM, and the host provides a compatible React or Vue runtime.

**Normal integration requires neither a CSS import nor a Less loader.**

<a id="quick-start"></a>

## React quick start

```tsx | pure
import { useRef } from 'react';
import { DocumentViewer } from '@filumo/react';
import { office } from '@filumo/office';
import type { ViewerHandle } from '@filumo/react';

const plugins = [office()];
export function Preview({ file }: { file?: File }) {
  const ref = useRef<ViewerHandle>(null);
  return (
    <DocumentViewer
      ref={ref}
      source={file}
      plugins={plugins}
      options={{ height: 640, locale: 'en-US' }}
      onReady={(session) => console.info(session.getSnapshot().format)}
      onError={(error) => console.error(error)}
    />
  );
}
```

Omitting source displays the file picker. Keep the plugin array at module scope or memoize it; creating [office()] on every render rebuilds the viewer unnecessarily. View-only changes do not need a second parse.

## Vue 3, Vue 2 and JavaScript

Vue 3 uses @filumo/vue with template refs, Composition API and KeepAlive. Vue 2 uses @filumo/vue2 with Options API, $refs and KeepAlive. Do not copy a Vue 3 script-setup example into Vue 2.6.

Both adapters receive source, plugins and options, and emit ready, error, stateChange and capabilitiesChange. SFC templates can use @state-change and @capabilities-change. Keep runtime handles outside deep reactive business state. Framework integration provides separate complete examples.

```ts | pure
import { createViewer } from '@filumo/dom';
import { office } from '@filumo/office';

const viewer = createViewer(container, {
  plugins: [office()],
  height: 640,
  onError: (error) => console.error(error),
});
await viewer.open(file);
// Call on host unmount, not immediately after opening the document.
async function disposePreview() {
  await viewer.destroy();
}
```

## Document sources

| Input          | Example                                               | Notes                                            |
| -------------- | ----------------------------------------------------- | ------------------------------------------------ |
| File           | File-picker result                                    | Preserves name, type and size                    |
| Blob           | A response Blob                                       | Uses MIME/container detection without a filename |
| Uint8Array     | new Uint8Array(buffer)                                | Owns a byte copy; convert ArrayBuffer first      |
| string         | '/api/files/report.docx'                              | HTTP, HTTPS and blob URLs                        |
| URL descriptor | { url, name, mimeType, request }                      | Display metadata and RequestInit                 |
| Source factory | () => DocumentSource or Promise&lt;DocumentSource&gt; | Independent read/dispose lease on every open     |

Response, bare ArrayBuffer and the previous async (signal) => Response API are not DocumentInput types.

```ts | pure
await viewer.open({
  url: '/api/files/42',
  name: 'report.docx',
  request: { credentials: 'include' },
});
await viewer.open(new Uint8Array(buffer));
await viewer.open(file, { pluginId: 'office' });
```

pluginId selects an already registered plugin, not a package to install. Remote inputs follow browser CORS, credentials and CSP rules. Relative URLs resolve against the host Document's baseURI, not the package directory. Keep credentials out of URLs, examples and logs.

<a id="viewer-options"></a>

## Component props and configuration

| React prop | Type                    | Default / behavior                              |
| ---------- | ----------------------- | ----------------------------------------------- |
| source     | DocumentInput           | Optional; changed sources open a new document   |
| plugins    | readonly ViewerPlugin[] | Required; register only needed formats          |
| options    | ViewerConfiguration     | View options and creation policies              |
| className  | string                  | React host-container class                      |
| ref        | ViewerHandle            | Commands, snapshots, subscriptions and disposal |

Vue accepts the first three props and exposes methods through a template ref. Native createViewer(container, options) takes plugins, view options and callbacks in one configuration object.

### ViewOptions

| Field     | Type             | Default | Behavior                                                 |
| --------- | ---------------- | ------- | -------------------------------------------------------- |
| height    | number or string | 560px   | Numbers are pixels; percentages require a sized ancestor |
| zoom      | number           | 100     | Office range 25–300, expressed as a percentage           |
| theme     | light / dark     | light   | Shell/panel theme, not source-document colors            |
| locale    | zh-CN / en-US    | zh-CN   | Viewer interface language                                |
| watermark | string           | None    | Read-only overlay; no source rewrite                     |
| toolbar   | boolean          | true    | false hides the default toolbar                          |

Use viewer.update({...}) for these fields; the same source is not reparsed.

### Creation policies

| Field                       | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| pluginId                    | Default registered plugin; open can override it |
| resourcePolicy.maxFileBytes | Source-read limit in bytes                      |
| resourcePolicy.timeoutMs    | Open-operation timeout in milliseconds          |
| stylePolicy.mode            | auto (default) or external                      |
| stylePolicy.nonce           | Host CSP nonce for injected style elements      |

Limits must be positive finite numbers. Unset values add no arbitrary hard file cap; browser memory is still finite.

Framework adapters rebuild the underlying viewer when plugins or creation policies change. Native update accepts only view options; recreate the instance to change creation policies. Office archive limits belong to office({ resourcePolicy }).

## Events and readiness

| React / native callback | Vue event             | Payload and timing                                                 |
| ----------------------- | --------------------- | ------------------------------------------------------------------ |
| onStateChange           | stateChange           | ControllerSnapshot: detection, loading, ready, error, cancellation |
| onReady                 | ready                 | DocumentSession after view mounting; query current capabilities    |
| onCapabilitiesChange    | capabilitiesChange    | ViewerCapabilities when pages, search or actions change            |
| onError                 | error                 | Source, parsing, rendering or action Error                         |
| office.onWarning        | Not a component event | OfficeWarning for recoverable degradation                          |

ControllerSnapshot.status is idle, detecting, loading, ready, error, cancelled or disposed. Progress includes phase and optional loaded/total. Calculate a ratio only when total is positive; not every phase has a precise percentage.

onReady means preview is available, not that all pagination, resources or progressive parsing is complete. Session state, shell readiness and format capabilities are separate signals. Do not replace readiness with an arbitrary delay.

## Handle methods and lifecycle

| Method                          | Returns             | Purpose                                                             |
| ------------------------------- | ------------------- | ------------------------------------------------------------------- |
| open(input, selection?)         | Promise&lt;void&gt; | Open a source and replace the previous operation/session            |
| update(viewOptions)             | void                | Change presentation only                                            |
| setActive(active)               | void                | Suspend/resume presentation without clearing the source             |
| getSnapshot()                   | ControllerSnapshot  | State, session, error and progress                                  |
| subscribe(listener)             | () => void          | State subscription and unsubscribe callback                         |
| getCapabilities()               | ViewerCapabilities  | Current capabilities; possibly empty before readiness               |
| subscribeCapabilities(listener) | () => void          | Action/capability subscription                                      |
| destroy()                       | Promise&lt;void&gt; | Idempotent release of sessions, listeners, Workers and style leases |

React/Vue unmounting cleans up automatically. Vue KeepAlive pauses presentation and restores the same session. Native JavaScript hosts must call destroy.

Choose source-prop control or imperative open instead of calling both for the same input. Setting source to undefined does not clear an open document; unmount/remount for a fresh empty state.

<a id="capabilities"></a>

## Capabilities and custom toolbars

| Capability | State                                                               | Operations                       |
| ---------- | ------------------------------------------------------------------- | -------------------------------- |
| zoom       | value, min, max, step; optional presets, mode, toolbar              | set(percentage), mode.set(value) |
| navigation | index, count; zero-based index; optional toolbar                    | goTo(index)                      |
| search     | query, resultCount, currentIndex, searching                         | setQuery, next, previous         |
| actions    | id, label, kind, enabled, pressed, value, options; optional toolbar | run(value?)                      |

Capabilities depend on the plugin and readiness. Disable unsupported or unavailable actions instead of assuming every format always has pagination or search.

```ts | pure
const stop = viewer.subscribeCapabilities(() => {
  const capabilities = viewer.getCapabilities();
  console.info(
    capabilities.navigation?.index,
    capabilities.search?.resultCount,
  );
});
await viewer.getCapabilities().zoom?.set(125);
await viewer.getCapabilities().search?.setQuery('example');
// Unsubscribe when the host no longer needs notifications.
stop();
```

toolbar: false hides controls without removing capabilities. See Framework integration for a complete custom-button example. The default toolbar provides file selection, editable zoom, original download and fullscreen; secondary controls move into More actions on narrow containers.

Office controls follow document content: Word exposes available headings and revision views, Excel exposes source/reading modes, and presentations expose previous/next slide controls for multiple slides plus notes. Excel and presentation comment buttons appear when comments or review notes exist. Word page navigation and worksheet selection remain callable capabilities without duplicate default toolbar controls.

The zoom combobox combines percentage presets and fit modes. Spreadsheets offer fit width; Word and presentations also offer fit page. Confirming a percentage leaves automatic fitting. Plugins without presets or mode keep the basic numeric input.

### Office actions

| id                 | run argument / behavior                                    | Scope                                                                           |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| office.zoomMode    | percentage, fit-width, fit-page                            | fit-page is not available for spreadsheets                                      |
| office.search      | Toggle find panel                                          | Office                                                                          |
| office.outline     | Toggle outline                                             | Word                                                                            |
| office.revision    | final, markup, original                                    | Word; read-only projection                                                      |
| office.review      | Toggle comments                                            | Excel, PowerPoint                                                               |
| office.sheet       | Worksheet ID from options                                  | Excel                                                                           |
| office.sheetMode   | source, reading                                            | Excel                                                                           |
| office.notes       | Toggle speaker notes                                       | PowerPoint                                                                      |
| office.transitions | Toggle source slide transitions; hidden in default toolbar | PowerPoint                                                                      |
| PDF                | PDF                                                        | Continuous scrolling, outlines, thumbnails, search, rotation and text selection |
| Images             | PNG, JPEG, GIF, WebP, BMP, SVG, AVIF                       | Zoom, pan, rotation and reset; decoding depends on the browser                  |
| Text               | TXT, LOG, INI, CONF, CFG, PROPERTIES, OUT                  | Encoding, source, line numbers, wrapping and readable fallback                  |
| JSON               | JSON, JSONC, JSONL, NDJSON                                 | Structure/source, duplicate keys and record diagnostics                         |
| Markdown           | MD, MARKDOWN                                               | Reading/source, outlines, tasks, tables and controlled HTML                     |
| CSV                | CSV, TSV                                                   | Windowed tables, delimiters, column widths and selection copy                   |
| XML                | XML                                                        | Split source/structure, namespaces and source mapping                           |
| Code               | Common languages, scripts, configuration and build files   | Source highlighting, languages, line numbers and search                         |

Find an action by id and check enabled. Read choices from options; display names are not worksheet IDs. Navigation, zoom modes and revisions never modify the original bytes.

<a id="office-options"></a>

## Office plugin options

```ts | pure
import { office } from '@filumo/office';
const plugins = [
  office({
    worker: 'auto',
    media: false,
    fonts: { fallbackFamilies: ['Arial', 'sans-serif'], warnOnMissing: true },
    onWarning: (warning) => console.warn(warning.code, warning.message),
  }),
];
```

| Option              | Type / default                         | Purpose                                                       |
| ------------------- | -------------------------------------- | ------------------------------------------------------------- |
| worker              | auto / always / never; auto by default | Fallback, require Worker, or main-thread parsing              |
| workerFactory       | () => Worker                           | Return a new module Worker for special hosts                  |
| fonts               | OfficeFontOptions                      | Aliases, font resources, fallbacks and missing-font warnings  |
| media               | false or { allowExternal?, download? } | false disables playback; external media is blocked by default |
| resourcePolicy      | Office resource limits                 | File, timeout and archive-expansion limits                    |
| onWarning           | (OfficeWarning) => void                | Recoverable parser/font/resource diagnostics                  |
| onHyperlinkActivate | (OfficeHyperlinkActivateEvent) => void | Observe or prevent default link navigation                    |

Office resourcePolicy supports maxFileBytes, timeoutMs, maxArchiveEntries, maxArchiveEntryBytes, maxArchiveInflatedBytes and maxCompressionRatio. Sizes are bytes; ratios are unitless. Generic source policies cover reading/downloading while Office policies cover parsing. Set limits based on your workload.

## Worker deployment

The default Worker is published as @filumo/office/worker.js and referenced with new URL/import.meta.url. The host bundler must emit that asset. A package path is not necessarily a publicly served URL.

```ts | pure
const plugins = [
  office({
    worker: 'always',
    workerFactory: () =>
      new Worker('/assets/filumo-office-worker.js', { type: 'module' }),
  }),
];
```

Deploy the custom URL with the correct JavaScript MIME, CSP and origin rules. auto may fall back; always helps expose missing Worker assets during production diagnosis. Do not rely on fallback to hide deployment errors.

## Automatic styles and CSP

stylePolicy.mode defaults to auto. Shell and view styles load on demand and are reference-counted within each Document. Unmounting one viewer does not remove styles another viewer uses. Office selectors and image overlays retain their package-version scope.

```tsx | pure
<DocumentViewer
  source={file}
  plugins={plugins}
  options={{ height: 640, stylePolicy: { nonce: cspNonce } }}
/>
```

Explicit external mode is the exception requiring CSS imports:

```ts | pure
import '@filumo/dom/styles.css';
import '@filumo/image/styles.css';
import '@filumo/office/styles.css';
const viewer = createViewer(container, {
  plugins: [office()],
  stylePolicy: { mode: 'external' },
});
```

CSS must match the package versions. Missing or conflicting group markers fail explicitly. A nonce authorizes style elements, not inline layout attributes; configure style-src-attr according to your security policy. Do not disable site CSP to resolve a local styling issue.

## Formats, images and interactions

| Family     | Extensions                 | Interactions                                                           |
| ---------- | -------------------------- | ---------------------------------------------------------------------- |
| Word       | DOC, DOCX, DOCM, DOTX, WPS | Pagination, outline, find, zoom, read-only revisions/comments          |
| Excel      | XLS, XLSX, XLSM, XLTX      | Sheets, sparse grid, merges/frozen panes, reading mode, find/comments  |
| PowerPoint | PPT, PPTX, PPTM, POTX      | Thumbnails, navigation, notes, images, media and supported transitions |

- Double-click images to zoom, rotate, reset, download or close. Escape restores focus to the trigger.
- Source spreadsheet mode preserves row/column geometry; reading mode improves readability. Empty grid cells only fill the viewport.
- Normal text selection does not activate hyperlinks. Follow the Ctrl/Command-click hint. event.preventDefault() blocks default navigation.
- fonts.aliases, fallbackFamilies and sources supply licensed font mappings/resources. Missing fonts can change wrapping and pagination.
- Macros do not execute. Revisions, comments, formula caches and media rendering do not provide a full Office editor.

## Original export and future editing

```ts | pure
import { exportOriginal } from '@filumo/core';
const session = viewer.getSnapshot().session;
if (session) {
  const result = await exportOriginal(session.source, session.signal);
  console.info(result.name, result.bytes.byteLength);
}
```

result.bytes is an independent copy. The host owns subsequent download/storage and object-URL cleanup. Watermarks, zoom, reading mode and revision projections do not alter original data.

There is currently no save API, editing command set, undo stack, collaboration layer or format writer. exportOriginal does not save edits. See Plugins & future editing for the extension boundary.

## Errors and security

open can reject, with failures also surfaced through onError/error. A replaced task uses AbortError cancellation and should not become a user-facing business failure.

| Common Core code                        | Check                                        |
| --------------------------------------- | -------------------------------------------- |
| INVALID_INPUT / INVALID_SOURCE_URL      | Input type and URL scheme                    |
| UNKNOWN_PLUGIN / UNSUPPORTED_FORMAT     | Plugin registration and actual file contents |
| DUPLICATE_PLUGIN / PROTOCOL_MISMATCH    | Duplicate IDs or protocol versions           |
| DOWNLOAD_FAILED                         | HTTP response, network, CORS and credentials |
| FILE_SIZE_LIMIT_EXCEEDED / LOAD_TIMEOUT | Host policies and loading conditions         |
| SOURCE_DISPOSED / VIEWER_DISPOSED       | Do not reuse a disposed source/viewer        |

Not every Error has a code. Parser, resource and browser errors originate in different layers. Browser-only processing is not risk-free: use resource policies and keep files, authorization headers and tokens out of public logs.

<a id="development"></a>

## Local development

| Command                         | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| pnpm docs:dev                   | dumi docs and public Playground; compiles package sources |
| pnpm smoke                      | React-based private sample runner at /dev/smoke-test      |
| pnpm demo:js                    | Native JavaScript build-output example                    |
| pnpm demo:react                 | React example                                             |
| pnpm demo:vue3 / pnpm demo:vue2 | Separate Vue examples                                     |
| pnpm build                      | Build component packages                                  |
| pnpm docs:build                 | Build the public documentation site                       |

docs:dev and smoke compile package sources directly with development aliases and source-change propagation. Startup prepares package metadata, public fixtures and PDF assets without building all packages. Standalone demos consume build output: rebuild and restart them after package-source changes. See the development guide for commands and privacy boundaries.

## Compatibility, limitations and migration

Declared peers are React >=18 <20, Vue >=3.3 <4 and Vue 2.6/2.7. Historical checks covered React 18.3.1/19.2.0, Vue 3.5.43, Vue 2.6.14/2.7.16 and Vite 5.4.21; they do not certify all renamed 0.1.0 formats. Vue 2 support is not a promise of IE11 or every Webpack 4 default configuration.

Browser typography, complex binary documents, charts and media codecs have limits. Pixel-identical Microsoft Office/WPS output is not guaranteed. First preview of a windowed/progressive document does not imply all pages are finished.

The old uri, parseOptions, defaultViewState and deep layout entry points are not Filumo APIs. Follow Migration to Filumo instead of adding compatibility wrappers. All navigation guides have English and Chinese versions. Private files and internal implementation plans stay outside the public site.
