---
title: Image and PDF previews
description: Native image viewing and continuous PDF reading, with matching PDF.js assets, Worker deployment, sidebar interactions and resource budgets.
keywords:
  - Filumo
  - file preview
  - document viewer
  - browser
siteLayout: docs
toc: content
---

# Image and PDF previews

Image and PDF plugins are framework-independent. Published versions are listed per package on npm. Validate actual browser behavior and performance in the target host.

## Integration

```ts | pure
import { createViewer } from '@filumo/dom';
import { image } from '@filumo/image';
import { pdf } from '@filumo/pdf';

const viewer = createViewer(container, {
  height: 640,
  plugins: [image(), pdf()],
});
await viewer.open(file);
// 宿主卸载时释放会话及资源。
async function disposePreview() {
  await viewer.destroy();
}
```

React, Vue 3 and Vue 2 use the same plugins. The standard preset also includes both descriptors. Registration does not load the engine, view or PDF assets eagerly.

## Default resources and host overrides

Normal integration uses `pdf()`. The engine is loaded through a module dynamic import, and the Worker uses the package's `new Worker(new URL(..., import.meta.url))` entry. Matching CMaps, standard fonts, WASM, ICC profiles and decoder fallbacks are located through the bundled resource catalogue. Text-layer styles load from a module when needed. Default integration does not require copying the static directory manually.

Registration creates no Worker and downloads no auxiliary data. Build output and network loading are separate: fonts, character maps and decoder data are requested when the PDF needs them. There is no default public CDN or automatic CDN fallback.

| Option                    | Default                       | Override                                                                                    |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| assetsBaseUrl             | Bundled integration           | Root for the complete matching external engine, Worker, auxiliary assets and text-layer CSS |
| cMapUrl                   | Bundled packed CMaps          | Directory containing matching packed bcmap files                                            |
| standardFontDataUrl       | Bundled fonts                 | Standard font directory                                                                     |
| wasmUrl                   | Bundled WASM and JS fallbacks | Decoder directory including matching fallback scripts                                       |
| iccUrl                    | Bundled profiles              | ICC directory                                                                               |
| workerSrc / workerFactory | Bundled adapted Worker        | Custom address or factory; factory has priority                                             |
| useWasm                   | true                          | false explicitly uses available JavaScript image-decoder fallbacks                          |

Priority is **individual directory > corresponding assetsBaseUrl directory > bundled default**. An omitted URL does not disable a feature. Blank strings, invalid protocols and nonboolean useWasm fail explicitly. Relative overrides resolve against the host page baseURI; directory paths are normalized with trailing slashes.

```ts | pure
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

Every override is optional. Unchanged categories keep their defaults.

## Advanced: complete external deployment

Only hosts choosing a separate asset directory need to copy the contents of `@filumo/pdf/dist/assets/pdfjs/`, preserving the layout, and set `pdf({ assetsBaseUrl: '/filumo-pdf/' })`. Keep the engine, Worker, CMaps, fonts, WASM, ICC, CSS, LICENSE and NOTICE together.

All files and decoder fallback scripts must match the pinned pdfjs-dist 6.4.299 release. A custom CDN is explicit and follows CORS/CSP; cross-origin Workers also have browser origin restrictions. Directory query parameters require the package's adapted Worker. A raw PDF.js Worker needs complete ordinary resource directories and cannot resolve the package's private resource identifiers.

Docs, smoke and default examples use the same bundled resource path; public/filumo-assets/pdf copying no longer masks default failures. FILUMO_DOCS_BASE still controls site deployment paths while the bundler handles final asset URLs.

Compatibility requires actual published-artifact checks in Vite development/production, Webpack/dumi and non-root deployments. Use the exact-commit verification matrix; untested hosts are not certified.

## Images

PNG, JPEG/JPG, GIF, WebP, BMP and SVG are supported through browser decoding; AVIF depends on browser support. SVG uses an image context. Ordinary images are not converted to Canvas before display.

The initial view fits the container without enlarging small images. 100% uses physical-pixel sizing. Pan, zoom, rotation and reset are available. Standalone images use the viewer toolbar; Office content images use an overlay. Both reuse @filumo/image/view.

Office retains ownership of image leases, conversions and original downloads. The shared image view is a declared Office dependency and does not require Office internal types in the host.

image({ maxDecodedPixels }) limits dimensions after natural size becomes available; it cannot enforce a strict pre-decode browser memory cap. Limit original file bytes with resourcePolicy.maxFileBytes.

## Continuous PDF reading

All logical pages form one vertical document for ordinary mouse-wheel scrolling. Initial zoom fits width. Page navigation, outlines, thumbnails, find, rotation and visible-page text selection are supported.

The sidebar has Outline, Thumbnails and Find tabs. It opens on outlines when available, otherwise thumbnails. The toolbar retains outline/sidebar and find entry points; thumbnails live in the sidebar. Hiding and reopening restores the last tab. Switching tabs preserves queries, results and list positions.

Thumbnails render only while their tab is active. Search windows page numbers and snippets; switching away or hiding the sidebar pauses scanning, and returning resumes unfinished pages. Switching tabs alone does not navigate. Clicking a result or choosing next/previous does. Scanned PDFs have no OCR.

Logical pages are separate from rendered page DOM. Visible pages render first, nearby pages prefetch, and distant high-resolution canvases are evicted within budgets. Page-relative anchors preserve reading position across mixed page sizes, zoom and rotation.

Defaults are concurrency 2, maximum DPR 2, 8,388,608 pixels per canvas, a 96 MiB Canvas budget, an estimated 16 MiB text cache and 10,000 search matches. Configure these with PdfOptions. They are local budgets, not total-process memory bounds or performance acceptance results.

## Sources, errors and lifecycle

Core's optional getRangeReader provides efficient range reads. Local Blob sources use slices; remote sources need actual 206 responses with complete range metadata. The older readRange may fall back to full reads, so a range-shaped API alone does not prove network savings.

Without range support the reader falls back to full content, reuses a 200 probe response and preserves authorization and cancellation. Changed content, length or version requires reopening. PDF parser failures do not fall back to Text.

Password prompts retry within the same session without logging passwords. Page-local errors can retry in place; document damage produces a document error.

Call destroy when leaving a native host. KeepAlive uses setActive to pause rendering while retaining the page and zoom. Disposal releases Workers, canvases, text layers, URLs, listeners and style leases.

## Validation scope

Check current Chrome/Edge and the target Firefox ESR/Safari versions, non-root deployment and strict CSP. PDF engine requirements need separate consideration; an ES2020 compilation target alone does not prove old-browser support.

Build, browser and large/scanned-PDF performance conclusions require actual execution records. Unexecuted checks are not passing checks.
