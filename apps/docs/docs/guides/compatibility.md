---
title: Filumo Compatibility and Limits
description: Filumo 0.1.0 declared framework ranges, format limits, resource budgets and historical validation boundaries.
keywords:
  - Filumo
  - file preview
  - document viewer
  - browser
siteLayout: docs
toc: content
---

# Compatibility and limits

## Version and declared support

All public workspace packages use **0.1.0**, which is not yet published. Source capabilities and dependency declarations are not a claim of completed browser acceptance for the current version.

| Host              | Declared range                 | Adapter       |
| ----------------- | ------------------------------ | ------------- |
| React             | >=18 <20                       | @filumo/react |
| Vue 3             | >=3.3 <4                       | @filumo/vue   |
| Vue 2             | ^2.6.14 or ^2.7.16             | @filumo/vue2  |
| Native JavaScript | ESM and DOM in modern browsers | @filumo/dom   |

The workspace uses pinned pnpm; consumer projects may choose their own manager. Format packages do not depend on React/Vue. React/Ant Design used by the private documentation app are not required by native or Vue consumers.

## Historical validation and current status

Historical records include React 18.3.1/19.2.0, Vue 3.5.43, Vue 2.6.14/2.7.16, Vite 5.4.21, isolated package consumption, Workers, styles and non-root deployment checks. These records do not certify every format after the Filumo rename.

Release readiness needs build, type, unit, isolated-consumer and real-browser evidence from the same commit. Unexecuted checks are not passing checks. PDF performance still requires representative large-file measurements. Local cache budgets do not bound the whole browser process.

## Nine format plugins

Office, PDF, image, text, JSON, Markdown, CSV, XML and code are registered in the standard preset. See the [package overview](./packages) for all fifteen packages.

Images use browser decoders. PDF requires pinned PDF.js and matching assets; see [images and PDF](./image-pdf). Encoding, budgets and language coverage are described in [text and structured formats](./text-formats).

## File formats

| Parser family | Extensions                       |
| ------------- | -------------------------------- |
| DOC / DOCX    | .doc, .wps / .docx, .docm, .dotx |
| XLS / XLSX    | .xls / .xlsx, .xlsm, .xltx       |
| PPT / PPTX    | .ppt / .pptx, .pptm, .potx       |

Filename and MIME are hints. Renaming a PDF to DOCX does not make it supported. Container contents must also be parsed. Macro-enabled extensions expose read-only content without executing macros.

The table above lists Office extensions only. Other plugin ranges are in the format guides. JSONC does not imply JSON5; XML does not own SVG; HTML code stays source; Markdown renders controlled HTML only. Unknown-file fallback requires Text readability checks.

## Rendering boundaries

- Word: fonts, pagination, floating objects, complex tables and revision layout can differ from Office/WPS.
- Excel: cached values and supported static semantics are displayed; full formula recalculation, editing and external connections are not provided.
- PowerPoint: complex masters, SmartArt, WordArt, animations and codecs are not universally reproduced. Transitions are a supported subset.
- Images: browser decoders, vector conversion and resource validity determine renderability. Failures produce diagnostics.
- Comments, revisions, watermarks and reading mode remain preview features, not editing/saving capabilities.

## Browsers and frameworks

Target browsers provide modern DOM, Worker, ResizeObserver, Blob and ESM support. IE11 is not supported. Vue 2 support does not imply that Webpack 4, old Chromium or every SSR framework works without configuration.

Module imports may participate in server builds, but viewer creation, File access and rendering belong on the client. Hosts such as Next.js need a client boundary. Validate Worker and asset output with untested bundlers.

## Large files and performance

Progressive parsing and windowed rendering separate first preview from finished pagination and media loading. Memory, archive expansion, font count, table dimensions and media size all matter.

Set resource limits using realistic files and targeted benchmarks. No universal loading-time or unlimited-size guarantee is made. Deactivation reduces rendering work but does not dispose the session; destroy it when leaving the page.

## Security and assets

- Browser-local parsing does not make arbitrary files trusted. Bound source, size, timeout and decompression work.
- External fonts, media and links follow browser CORS/CSP and component resource policies.
- Automatic CSS uses style elements and version scopes. Strict CSP requires the correct nonce; inline layout attributes still need an appropriate style-src-attr policy.
- workerFactory must point to an accessible module Worker, not an HTML/404 response.
- Do not publish private documents, authorization headers or sensitive screenshots in the public site or CI artifacts.

## Recommended checks

Test the target framework, production bundler, deployment base and representative files in a real browser. Cover open/switch, zoom, find, image overlays, disposal and automatic styles. Type safety is not a replacement for visual acceptance.
