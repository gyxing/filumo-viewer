---
title: Quick start
description: Install, mount and clean up a Filumo preview.
keywords:
  - Filumo
  - file preview
  - document viewer
siteLayout: docs
toc: content
---

# Quick start

<a id="quick-start"></a>

<div className="filumo-doc-callout" data-kind="info">Use published packages or packed workspace artifacts; source and release status are distinct.</div>

## Install and choose packages

Use a published version from npm, or use packed workspace artifacts before release. Keep the plugin array stable.

```sh
npm install @filumo/react @filumo/viewer
```

## React preview

```tsx | pure
import { DocumentViewer } from '@filumo/react';
import { standardPlugins } from '@filumo/viewer';
export function Preview({ file }: { file?: File }) {
  return <DocumentViewer source={file} plugins={standardPlugins} options={{ height: 640 }} onError={console.error} />;
}
```

Normal integration needs no CSS import. The preset installs all declared format dependencies; engines, views and resources still load on demand. Install individual format packages when fewer formats are needed.

## Native JavaScript

```ts | pure
import { createViewer } from '@filumo/dom';
import { standardPlugins } from '@filumo/viewer';
export async function mountPreview(container: HTMLElement, file: File) {
  const viewer = createViewer(container, { plugins: standardPlugins, height: 640, onError: console.error });
  await viewer.open(file);
  return () => viewer.destroy();
}
```

Call the returned cleanup function when the host unmounts. A string source is a URL; wrap direct text in File, Blob or a custom source.

## Next steps

- [Framework integration](./preview-integration) for Vue, React StrictMode and SSR.
- [Complete supported formats](./compatibility), [Viewer API](./viewer-api) and [Plugin options](./plugin-api).
- [Production deployment](./deployment) and [Troubleshooting](./troubleshooting).
