---
title: Fivo Developer Documentation
description: Framework integration, public APIs, resource deployment and development guides for Fivo Office preview.
siteLayout: docs
toc: content
---

# Fivo developer documentation

Fivo is a browser-based, cross-framework Office preview library. Parsing, images, charts and rendering run in the browser without a document-conversion service. React, Vue 3, Vue 2 and JavaScript hosts share the native DOM renderer.

> The current workspace version is **0.1.0-next.0** and has not been published to npm. This documentation describes implemented features only. PDF, text, Markdown, JSON, editing and saving edited files are future extensions. Do not install unrelated packages with similar names or use the previous package entry points.

<nav className="office-viewer-docs__quick-links" aria-label="Documentation shortcuts">
  <a href="#quick-start">Quick start</a>
  <a href="#viewer-options">Options & events</a>
  <a href="#capabilities">Toolbar & capabilities</a>
  <a href="#office-options">Office options</a>
  <a href="#development">Local development</a>
</nav>

## Packages and lazy loading

| Package      | Responsibility                                                    | Use when                                 |
| ------------ | ----------------------------------------------------------------- | ---------------------------------------- |
| @fivo/core   | Sources, plugin protocol, sessions, cancellation, original export | Building document flows or plugins       |
| @fivo/dom    | Native viewer shell, styles and generic capabilities              | Using JavaScript or a custom host        |
| @fivo/office | Office descriptor, drivers and native renderers                   | Previewing Word, Excel and PowerPoint    |
| @fivo/react  | React 18/19 adapter                                               | Using React                              |
| @fivo/vue    | Vue 3 adapter                                                     | Using Vue 3                              |
| @fivo/vue2   | Vue 2.6/2.7 adapter                                               | Using Vue 2                              |
| @fivo/viewer | Explicit Office-only standard preset                              | Reusing the stable standardPlugins array |

Install only your framework adapter. JavaScript and Vue hosts do not acquire React through the Office package.

`office()` creates a lightweight descriptor. Drivers and the appropriate format view load when a document opens. PDF and other future plugins are not installed implicitly or added to existing consumers automatically.

## Installation and workspace use

Use the repository's pinned pnpm version for development:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo:react
```

After publication, select your adapter and @fivo/office. Before publication, use the workspace or locally built and packed packages; see Framework integration in the navigation for the exact process. Packages are ESM, and the host provides a compatible React or Vue runtime.

**Normal integration requires neither a CSS import nor a Less loader.**

<a id="quick-start"></a>

## React quick start

```tsx | pure
import { useRef } from 'react';
import { DocumentViewer } from '@fivo/react';
import { office } from '@fivo/office';
import type { ViewerHandle } from '@fivo/dom';

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

Vue 3 uses @fivo/vue with template refs, Composition API and KeepAlive. Vue 2 uses @fivo/vue2 with Options API, $refs and KeepAlive. Do not copy a Vue 3 script-setup example into Vue 2.6.

Both adapters receive source, plugins and options, and emit ready, error, stateChange and capabilitiesChange. SFC templates can use @state-change and @capabilities-change. Keep runtime handles outside deep reactive business state. Framework integration provides separate complete examples.

```ts | pure
import { createViewer } from '@fivo/dom';
import { office } from '@fivo/office';

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

| id                 | run argument / behavior                                    | Scope                                      |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| office.zoomMode    | percentage, fit-width, fit-page                            | fit-page is not available for spreadsheets |
| office.search      | Toggle find panel                                          | Office                                     |
| office.outline     | Toggle outline                                             | Word                                       |
| office.revision    | final, markup, original                                    | Word; read-only projection                 |
| office.review      | Toggle comments                                            | Excel, PowerPoint                          |
| office.sheet       | Worksheet ID from options                                  | Excel                                      |
| office.sheetMode   | source, reading                                            | Excel                                      |
| office.notes       | Toggle speaker notes                                       | PowerPoint                                 |
| office.transitions | Toggle source slide transitions; hidden in default toolbar | PowerPoint                                 |

Find an action by id and check enabled. Read choices from options; display names are not worksheet IDs. Navigation, zoom modes and revisions never modify the original bytes.

<a id="office-options"></a>

## Office plugin options

```ts | pure
import { office } from '@fivo/office';
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

The default Worker is published as @fivo/office/worker.js and referenced with new URL/import.meta.url. The host bundler must emit that asset. A package path is not necessarily a publicly served URL.

```ts | pure
const plugins = [
  office({
    worker: 'always',
    workerFactory: () =>
      new Worker('/assets/fivo-office-worker.js', { type: 'module' }),
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
import '@fivo/dom/styles.css';
import '@fivo/office/styles.css';
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
import { exportOriginal } from '@fivo/core';
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

| Command                         | Purpose                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| pnpm docs:dev                   | dumi docs and public Playground; builds packages before starting |
| pnpm smoke                      | React-based private sample runner at /dev/smoke-test             |
| pnpm demo:js                    | Native JavaScript build-output example                           |
| pnpm demo:react                 | React example                                                    |
| pnpm demo:vue3 / pnpm demo:vue2 | Separate Vue examples                                            |
| pnpm build                      | Build component packages                                         |
| pnpm docs:build                 | Build the public documentation site                              |

Package sources do not yet have a watch pipeline. Rebuild after changes to packages and restart demo servers; a browser refresh alone cannot rebundle them. The demo port defaults to 4173 and accepts --port 4174. See Development & testing for commands, private fixtures and deployment prefixes.

## Compatibility, limitations and migration

Verified combinations include React 18.3.1/19.2.0, Vue 3.5.43, Vue 2.6.14/2.7.16, Vite 5.4.21 and real browsers. Vue 2 support is not a promise of IE11 or every Webpack 4 default configuration.

Browser typography, complex binary documents, charts and media codecs have limits. Pixel-identical Microsoft Office/WPS output is not guaranteed. First preview of a windowed/progressive document does not imply all pages are finished.

The old uri, parseOptions, defaultViewState and deep layout entry points are not Fivo APIs. Follow Migration to Fivo instead of adding compatibility wrappers. All navigation guides have English and Chinese versions. Private files and internal implementation plans stay outside the public site.
