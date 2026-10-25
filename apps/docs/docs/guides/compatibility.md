---
title: Filumo Compatibility and Limits
description: Filumo declared framework ranges, format limits, resource budgets and historical validation boundaries.
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

This documentation follows repository source; published versions are listed per package on npm. Source capabilities and dependency declarations are not a claim of completed browser acceptance for the current version.

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

### Verification matrix

| Scope | Evidence and boundary |
| --- | --- |
| Build, types, units | Validate workflow for the exact commit |
| Framework consumers | Packed-artifact and npm/Yarn host steps |
| Chromium UI | Public-fixture browser step, not Safari/Firefox certification |
| GitHub Pages | Deployment for the same commit and actual base |
| Large scans, other browsers and SSR | Target-environment acceptance required; unexecuted checks are not passed |

[Workflow records](https://github.com/gyxing/filumo-viewer/actions) identify the tested commit and environment.

## Nine format plugins

Office, PDF, image, text, JSON, Markdown, CSV, XML and code are registered in the standard preset. See the [package overview](./packages) for all fifteen packages.

Images use browser decoders. PDF requires pinned PDF.js and matching assets; see [images and PDF](./image-pdf). Encoding, budgets and language coverage are described in [text and structured formats](./text-formats).

## File formats

The list below covers all default extensions and explicit filenames across the nine plugins. Extensions are case-insensitive; filename and MIME hints still require actual content validation.

<!-- filumo-format-catalog:start -->
### Office documents · @filumo/office

| Group | Extensions | Filenames and variants |
| --- | --- | --- |
| Word / WPS | `.doc`, `.wps`, `.docx`, `.docm`, `.dotx` | - |
| Excel | `.xls`, `.xlsx`, `.xlsm`, `.xltx` | - |
| PowerPoint | `.ppt`, `.pptx`, `.pptm`, `.potx` | - |

Documents, workbooks, presentations and supported templates are read-only. Macro-enabled files display supported content without executing macros.

### PDF · @filumo/pdf

| Group | Extensions | Filenames and variants |
| --- | --- | --- |
| PDF documents | `.pdf` | - |

Continuous reading with outlines, thumbnails and text search. Scanned pages do not gain searchable text without OCR.

### Images · @filumo/image

| Group | Extensions | Filenames and variants |
| --- | --- | --- |
| Image files | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.svg`, `.avif` | - |

Rendering depends on the browser decoder, including AVIF. SVG is displayed in an image context; arbitrary XML is not treated as an image.

### Plain text · @filumo/text

| Group | Extensions | Filenames and variants |
| --- | --- | --- |
| Text and logs | `.txt`, `.log`, `.ini`, `.conf`, `.cfg`, `.properties`, `.out` | - |

Other unknown or extensionless files can use optional text fallback only after readability checks. Binary content and dedicated-format parse failures do not become plain text.

### JSON · @filumo/json

| Group | Extensions | Filenames and variants |
| --- | --- | --- |
| JSON variants | `.json`, `.jsonc`, `.jsonl`, `.ndjson` | - |

JSONC supports comments and trailing commas; JSONL and NDJSON validate records independently. JSON5 is not supported.

### Markdown · @filumo/markdown

| Group | Extensions | Filenames and variants |
| --- | --- | --- |
| Markdown files | `.md`, `.markdown` | - |

GFM and controlled HTML are rendered in reading mode. Scripts, global styles, arbitrary embedded pages, formulas and Mermaid are not executed or rendered.

### CSV / TSV · @filumo/csv

| Group | Extensions | Filenames and variants |
| --- | --- | --- |
| Delimited tables | `.csv`, `.tsv` | - |

Read-only table previews preserve fields as strings, support separators and selection copying, and never execute formulas.

### XML · @filumo/xml

| Group | Extensions | Filenames and variants |
| --- | --- | --- |
| XML documents | `.xml` | - |

Source and structure views preserve namespaces and attributes. DTD declarations are rejected; SVG belongs to the image plugin.

### Code and development files · @filumo/code

| Group | Extensions | Filenames and variants |
| --- | --- | --- |
| JavaScript, TypeScript and HTML | `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`, `.html`, `.htm` | - |
| Stylesheets | `.css`, `.less`, `.scss`, `.sass` | - |
| Shell, PowerShell and Batch | `.sh`, `.bash`, `.zsh`, `.ps1`, `.psm1`, `.psd1`, `.bat`, `.cmd` | - |
| Other programming languages | `.py`, `.pyw`, `.sql`, `.java`, `.c`, `.h`, `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx`, `.cs`, `.go`, `.rs`, `.php`, `.rb`, `.rake`, `.kt`, `.kts`, `.swift`, `.lua` | - |
| Configuration and environment | `.yaml`, `.yml`, `.toml`, `.env` | `.env`, `.env.*` |
| Build, protocols and patches | `.dockerfile`, `.mk`, `.cmake`, `.graphql`, `.gql`, `.proto`, `.diff`, `.patch` | `Dockerfile`, `Makefile`, `GNUmakefile`, `CMakeLists.txt`, `Dockerfile.*` |

Source preview only: HTML is not rendered, scripts do not run and stylesheets are not compiled or applied. Dedicated formats such as JSON and XML take priority over filename variants. Vue and Svelte mixed-syntax support is outside the current scope.
<!-- filumo-format-catalog:end -->

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
