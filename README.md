# Filumo

<p>
<strong>English</strong> | <a href="./README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

A cross-framework, lazy-loaded browser file viewer. Native DOM renderers are shared by React, Vue 3, Vue 2 and JavaScript adapters. Published versions are listed per package on npm; repository documentation may include work that has not been released.

## Formats and package selection

- Office: supported Word/WPS, Excel and PowerPoint documents, templates and macro-enabled content. Macros are never executed.
- PDF and images: continuous PDF reading, outlines, thumbnails, search, pan, zoom, rotation and shared image overlays.
- Text and data: plain text/logs, JSON/JSONC/JSONL/NDJSON, Markdown, CSV/TSV, XML and code/development files.

The [complete format list](https://gyxing.github.io/filumo-viewer/docs/guides/compatibility) contains all default extensions and filenames, plus rendering and browser limits. All previews are read-only; editing/saving, OCR, formula recalculation and pixel-perfect Office fidelity are outside the current scope.

## Install and preview

```sh
npm install @filumo/react @filumo/viewer
# 或使用 pnpm
pnpm add @filumo/react @filumo/viewer
```

```tsx
import { DocumentViewer } from '@filumo/react';
import { standardPlugins } from '@filumo/viewer';
export function Preview({ file }: { file?: File }) {
  return <DocumentViewer source={file} plugins={standardPlugins} options={{ height: 640 }} onError={console.error} />;
}
```

Keep plugins stable. Use one source-driving mechanism per update, and let adapters clean up on unmount. Native JavaScript hosts explicitly call destroy(). A string source is a URL; File, Blob, Uint8Array and source factories are also supported. See [quick start](https://gyxing.github.io/filumo-viewer/docs/guides/quick-start) and [framework integration](https://gyxing.github.io/filumo-viewer/docs/guides/preview-integration).

## Styles, Workers and PDF assets

Normal integration automatically loads active-format styles. Strict-CSP/external-style hosts must follow the documented nonce, CSS and style-attribute policy. Worker files and their relative chunks belong together; Vite uses worker.format: 'es'. PDF defaults to matching bundled engine, Worker and auxiliary resources, without a public CDN or manual public-directory copy.

See [production deployment](https://gyxing.github.io/filumo-viewer/docs/guides/deployment), [image/PDF options](https://gyxing.github.io/filumo-viewer/docs/guides/image-pdf) and [troubleshooting](https://gyxing.github.io/filumo-viewer/docs/guides/troubleshooting).

## All Filumo packages

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
| ------------------------ | ------------------------------------------ |
| React + Office           | `npm install @filumo/react @filumo/office` |
| Vue 3 + Markdown         | `npm install @filumo/vue @filumo/markdown` |
| Vue 2 + JSON             | `npm install @filumo/vue2 @filumo/json`    |
| JavaScript + images      | `npm install @filumo/dom @filumo/image`    |
| React + all nine formats | `npm install @filumo/react @filumo/viewer` |

The standard preset installs its declared format dependencies. Lazy loading controls browser execution, not npm installation. Select individual packages for a smaller dependency set. Packages may release independently; obey dependency ranges and match Workers/assets/styles to their owning package version.

## Local development

```sh
pnpm install --frozen-lockfile
pnpm docs:dev
pnpm smoke
```

Docs development and smoke compile package source with hot updates. Independent demo hosts consume built artifacts and need a package rebuild/restart after source edits. Checks run only when invoked:

```sh
pnpm build
pnpm test
pnpm run check
pnpm test:consumers
pnpm test:consumers:hosts
pnpm test:browser
```

See the [development guide](https://gyxing.github.io/filumo-viewer/docs/guides/testing) for fixtures, privacy and independent releases. GitHub Pages deployment and npm publication are separate operations.

## Documentation and feedback

- [Documentation](https://gyxing.github.io/filumo-viewer/docs)
- [Viewer API](https://gyxing.github.io/filumo-viewer/docs/guides/viewer-api) and [plugin options](https://gyxing.github.io/filumo-viewer/docs/guides/plugin-api)
- [CHANGELOG](./CHANGELOG.md), [contributing](./CONTRIBUTING.md) and [security](./SECURITY.md)
- [Issues](https://github.com/gyxing/filumo-viewer/issues) · [MIT license](./LICENSE)
