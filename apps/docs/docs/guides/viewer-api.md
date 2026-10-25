---
title: Viewer API
description: Sources, configuration, events, lifecycle and capability contracts.
keywords:
  - Filumo
  - file preview
  - document viewer
siteLayout: docs
toc: content
---

# Viewer API

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
| zoom      | number           | Format-dependent | Percentage; see initial modes below           |
| theme     | light / dark     | light   | Shell/panel theme, not source-document colors            |
| locale    | zh-CN / en-US    | zh-CN   | Viewer interface language                                |
| watermark | string           | None    | Read-only overlay; no source rewrite                     |
| toolbar   | boolean          | true    | false hides the default toolbar                          |

Use viewer.update({...}) for these fields; the same source is not reparsed.



Initial scale is format-specific: Word and Excel start at 100%; presentations fit the page when zoom is omitted. PDF fits width and images fit their container. An explicit zoom sets the initial percentage where supported; updates use the current capability range.

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

The zoom combobox combines percentage presets and fit modes. Spreadsheets offer fit width; Word and presentations also offer fit page. Confirming a percentage leaves automatic fitting. When presets are omitted, the shell offers 25%, 50%, 75%, 100%, 125%, 150% and 200%, filtered by the capability range. Manual limits belong to the format; Office accepts 25–300%.

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

For all extensions, build filenames and filename variants, see the [complete format list](./compatibility).

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



All format-specific factory options are listed in [Plugin options](./plugin-api). Production asset and CSP recipes are in [Production deployment](./deployment); symptom-based diagnostics are in [Troubleshooting](./troubleshooting).
