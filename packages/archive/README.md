# @filumo/archive

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Lazy, read-only archive browsing with directory trees, virtual file lists and on-demand previews through the host's registered plugins.

A single top toolbar shows the active child document's search, zoom and navigation capabilities. Parent navigation and file-name search stay above the left tree. During previews, one download menu distinguishes the current file from the original outermost archive; breadcrumbs identify the current path.

This documentation covers **0.1.0**. Repository features may precede npm publication.

## Formats and loading

ZIP and ZIP-based JAR/WAR/EAR/APK/AAB/CBZ/KMZ containers are browsed as files, without execution or domain-specific application support. TAR, GZIP/TAR.GZ, RAR v4/v5, 7z and TAR.XZ/TXZ use format-specific readers. Standalone XZ, encrypted and multipart archives are outside the first release. Exact codec coverage is established by the version's fixture validation.

Registration creates only descriptors. ZIP uses zip.js with source ranges where available; TAR reads offsets; GZIP processes sequential streams. RAR/7z/TAR.XZ load the pinned libarchive-wasm backend only when needed.

The first release keeps one added engine for XZ-compressed TAR archives, including TAR.XZ and TXZ. The engine does not expose the raw-format entry point needed for standalone XZ streams such as `.xz` or `.log.xz`; these are not supported, and no additional decompression dependency is added.

## Installation

```sh
npm install @filumo/dom @filumo/archive @filumo/text @filumo/code
```

## Minimal integration

```ts
import { createViewer } from '@filumo/dom';
import { archive } from '@filumo/archive';
import { text } from '@filumo/text';
import { code } from '@filumo/code';
const container = document.getElementById('viewer');
if (!container) throw new Error('Preview container is missing');
const viewer = createViewer(container, {
  height: 640,
  plugins: [archive(), text(), code()],
});
await viewer.open('/files/example.zip');
// 不再使用时释放归档、Worker 和子查看器。
window.addEventListener(
  'pagehide',
  () => {
    void viewer.destroy();
  },
  { once: true },
);
```

Only registered plugins are available inside archives. The archive package does not implicitly install Office, PDF or framework adapters. Use @filumo/viewer for the complete preset.

## Options and budgets

| Option                                   | Default               | Meaning                                                     |
| ---------------------------------------- | --------------------- | ----------------------------------------------------------- |
| resourcePolicy.maxEntries                | 20,000                | Maximum listed entries                                      |
| resourcePolicy.maxEntryBytes             | 128 MiB               | Maximum previewed child file                                |
| resourcePolicy.maxTotalUncompressedBytes | 512 MiB               | Cumulative actual output across replays and nested archives |
| resourcePolicy.maxNestedDepth            | 2                     | Root depth is zero                                          |
| resourcePolicy.cacheBytes                | 64 MiB                | Completed entry cache                                       |
| resourcePolicy.maxWasmInputBytes         | 64 MiB                | Full-input WASM limit, checked before materialization       |
| resourcePolicy.maxFullReadBytes          | 128 MiB               | Fallback full-read limit, not a range-browsing limit        |
| workerFactory                            | Bundled module Worker | Optional Worker creation override                           |
| assetsBaseUrl                            | Bundled assets        | Optional matching WASM resource directory                   |

## Large files and limits

Directory browsing, extraction, child preview and original download have different costs. Valid HTTP ranges allow ZIP/TAR reading without materializing the full input; servers must provide valid 206 and Content-Range behavior. Without ranges, full fallback is bounded.

TAR.GZ scanning decodes sequentially and discards unneeded bodies. Extracting another file can replay the stream. WASM formats currently need the complete input plus engine memory; indexing also drains and charges file bodies to bound solid-archive decompression. They do not provide the same large-file guarantees. Cache budgets are not process memory limits. Cancellation may terminate a busy Worker and conservatively retain one in-flight output block in the cumulative budget.

Large private remote downloads can be handled through ViewerOptions.downloadOriginal. A disabled default download does not silently read the complete file.

## Child resources

HTML/Markdown images can resolve to unique, safe sibling image entries. URLs are scoped to the child preview and released when it closes. Ambiguous or escaping paths are blocked. Cross-file document links are blocked by default; rendering a link must not eagerly extract or execute its target.

## Styles and assets

Automatic styles load with the view. In external style mode, import @filumo/dom/styles.css, @filumo/archive/styles.css and the actual child format styles before creation. Default Worker/WASM resources ship in this package; no CDN or manual public-directory copying is required. Preserve the published relative asset structure. Third-party license notices accompany WASM.

Public entries: @filumo/archive, @filumo/archive/styles.css, @filumo/archive/worker.js and @filumo/archive/assets. Internal paths are not stable APIs.

## Filumo packages

<!-- filumo-packages:start -->

| Package (npm)                                                        | Purpose                                                                 | Source documentation                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)           | Headless sources, plugin contracts, sessions and shared text utilities  | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)             | Native DOM viewer, toolbars, source views, outlines and shared UI       | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)       | Standard preset and factories for ten format plugins                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.md)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)       | Word, Excel, PowerPoint and supported legacy formats                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.md)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)             | Continuous PDF reading, outlines, thumbnails and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)         | Image preview, zoom, rotation, panning and shared overlays              | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.md)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)           | Plain text, logs, encoding detection and readable-text fallback         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.md)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)           | JSON / JSONC / JSONL / NDJSON source and structure views                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.md)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown)   | Markdown reading, outlines, GFM layout and code highlighting            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.md) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)             | CSV / TSV read-only grids, virtual scrolling and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)             | XML source, namespace-aware structure trees and node navigation         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.md)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)           | Read-only highlighting for code, scripts, configuration and stylesheets | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)         | React 18/19 adapter                                                     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)             | Vue 3 (>=3.3 <4) adapter                                                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)           | Vue 2 (^2.6.14 or ^2.7.16) adapter                                      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.md)     |
| **[@filumo/archive](https://www.npmjs.com/package/@filumo/archive)** | Archive directories, on-demand extraction and child previews            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.md)  |

<!-- filumo-packages:end -->

## Documentation and feedback

[Deployment](https://gyxing.github.io/filumo-viewer/docs/guides/deployment) · [API](https://gyxing.github.io/filumo-viewer/docs/guides/plugin-api) · [Issues](https://github.com/gyxing/filumo-viewer/issues)
