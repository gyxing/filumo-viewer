---
title: Fivo Compatibility and Limits
siteLayout: docs
toc: content
---

# Compatibility and limits

Compatibility is based on actual package-consumption and browser checks, not a claim that every Office feature, bundler or file is pixel-identical. This is a workspace preview release.

## Verified combinations

| Host / tool       | Version or setup                                                  | Notes                                                 |
| ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| React             | 18.3.1, 19.2.0                                                    | @fivo/react; includes React 18 development StrictMode |
| Vue 3             | 3.5.43                                                            | @fivo/vue; includes KeepAlive restore                 |
| Vue 2             | 2.6.14, 2.7.16                                                    | @fivo/vue2; Options API and KeepAlive                 |
| JavaScript        | Vite 5.4.21 and repository esbuild demos                          | No React installation                                 |
| Package consumers | pnpm 11.10.0, npm, Yarn 1.22.22                                   | Isolated hosts installing actual tarballs             |
| Deployment        | Default Worker, non-root base, automatic styles, strict-CSP tests | Verify special host policies separately               |

The workspace uses pnpm. Consumer projects may use their own package managers; that is not permission to mix lockfiles in the repository.

Public Office declarations do not depend on React, Vue or internal parser declarations. React/Ant Design in the private documentation app are not dependencies of native/Vue hosts.

## File formats

| Parser family | Extensions                       |
| ------------- | -------------------------------- |
| DOC / DOCX    | .doc, .wps / .docx, .docm, .dotx |
| XLS / XLSX    | .xls / .xlsx, .xlsm, .xltx       |
| PPT / PPTX    | .ppt / .pptx, .pptm, .potx       |

Filename and MIME are hints. Renaming a PDF to DOCX does not make it supported. Container contents must also be parsed. Macro-enabled extensions expose read-only content without executing macros.

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
