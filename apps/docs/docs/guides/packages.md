---
title: Packages and installation
description: All fifteen Filumo 0.1.0 packages, nine format plugins, framework installation choices and lazy-loading boundaries.
keywords:
  - Filumo
  - file preview
  - document viewer
  - browser
siteLayout: docs
toc: content
---

# Packages and installation

All fifteen public packages use **0.1.0**. This version is not yet published. npm links identify the intended package pages, not confirmed downloadable releases. Before publication, use the workspace or locally built and packed packages.

## Package catalogue

| Package                                                            | Responsibility                                                | Source and details                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | Sources, plugin protocol, sessions and shared text processing | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/core#readme)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | DOM shell, toolbar, outline and shared source views           | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/dom#readme)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | Lightweight standard preset for nine format plugins           | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/viewer#readme)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word, Excel, PowerPoint and supported WPS documents           | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/office#readme)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | Continuous PDF reading, thumbnails, outlines and search       | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/pdf#readme)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | Standalone images and shared image overlay interactions       | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/image#readme)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | Plain text, logs and readable-content fallback                | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/text#readme)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON, JSONC, JSONL and NDJSON                                 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/json#readme)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown reading, source, outlines and controlled HTML        | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/markdown#readme) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | Readonly CSV and TSV tables                                   | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/csv#readme)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | Split XML source and structure views                          | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/xml#readme)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | Common source, configuration, script and build files          | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/code#readme)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 adapter                                           | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/react#readme)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue >=3.3 <4 adapter                                          | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue#readme)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2.6/2.7 adapter                                           | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue2#readme)     |

## Choosing packages

Native JavaScript uses createViewer from @filumo/dom. React, Vue 3 and Vue 2 each have their own adapter. Install only the runtime used by your host; format packages do not depend on React or Vue.

These commands apply after publication and assume the host already provides its framework:

| Scenario                 | Install after publication                  |
| ------------------------ | ------------------------------------------ |
| React + Office           | `npm install @filumo/react @filumo/office` |
| Vue 3 + Markdown         | `npm install @filumo/vue @filumo/markdown` |
| Vue 2 + JSON             | `npm install @filumo/vue2 @filumo/json`    |
| JavaScript + images      | `npm install @filumo/dom @filumo/image`    |
| React + all nine formats | `npm install @filumo/react @filumo/viewer` |

Consumer projects may use pnpm or Yarn add commands. This repository itself uses the pinned pnpm version and a single lockfile.

## Standard preset and custom plugins

standardPlugins is a frozen array of nine lightweight descriptors, not a function or component: Office, Text, JSON, Markdown, Image, PDF, CSV, XML and Code. Import createViewer from @filumo/dom and DocumentViewer from your adapter.

```tsx | pure
import { DocumentViewer } from '@filumo/react';
import { standardPlugins } from '@filumo/viewer';

export function Preview({ file }: { file?: File }) {
  return (
    <DocumentViewer
      source={file}
      plugins={standardPlugins}
      options={{ height: 640 }}
    />
  );
}
```

PDF uses bundled modules and a matching resource catalogue by default. Ordinary hosts do not copy directories manually; use a stable custom array only when overriding resource options. See [images and PDF](./image-pdf).

```ts | pure
import {
  office,
  text,
  json,
  markdown,
  image,
  pdf,
  csv,
  xml,
  code,
} from '@filumo/viewer';

const plugins = [
  office(),
  text(),
  json(),
  markdown(),
  image(),
  pdf(),
  csv(),
  xml(),
  code(),
];
```

Installing @filumo/viewer installs every declared format dependency. Lazy loading controls browser execution, not npm installation. Install a format package directly when only that format is needed. Keep plugin arrays stable between framework renders.

## Lazy loading and shared utilities

Registration creates descriptors; drivers and views load for matching files. Source/structure modes, Markdown reading, PDF text and thumbnail work, and syntax highlighting retain their own deferred boundaries.

Shared decoding, line indexes and search live in @filumo/core/text. Shared source, outline and split views live in DOM subentries. JSON, Markdown, CSV, XML and Code do not depend on Text for those utilities. @filumo/text/reader and @filumo/text/view retain compatibility exports; prefer Core/DOM public entries for new integrations.

## Styles, Workers and PDF assets

Automatic mode loads shell and active-format styles without a Less loader. In external mode, directly install the packages whose CSS you import and load DOM then the enabled format styles; Office image overlays also need Image styles. Adapters and the preset have no standalone styles.css.

Format Workers use ESM. Manual deployment must preserve worker.js, worker-chunks and relative references; Vite needs worker.format: 'es'. PDF's engine, Worker and auxiliary assets must come from the same pinned PDF.js version.

## Version, limits and contribution

Keep package, Worker, asset and external-CSS versions aligned at 0.1.0. All previews are readonly, with no unlimited-size or complete Office fidelity guarantee. See [compatibility](./compatibility) for declared support and the distinction from historical validation.

Source is licensed under MIT. [GitHub](https://github.com/gyxing/office-file-viewer) · [Issues](https://github.com/gyxing/office-file-viewer/issues) · [CHANGELOG](https://github.com/gyxing/office-file-viewer/blob/master/CHANGELOG.md)
