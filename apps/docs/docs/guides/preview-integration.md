---
title: Fivo Framework Integration
siteLayout: docs
toc: content
---

# Framework integration

React, Vue 3, Vue 2 and JavaScript adapters share the native Office renderer, toolbar and automatic styles. A framework choice changes mounting and lifecycle integration, not the document engine.

## Before you start

Packages are not yet published to npm. Run pnpm install --frozen-lockfile and pnpm build in this repository, then start demo:react, demo:vue3, demo:vue2 or demo:js.

For an external project, use local packed artifacts rather than linking a package's source directory. pnpm test:consumers packs workspace dependencies and verifies isolated installations; records are stored in tmp/testing/consumers.json. It does not publish packages. After release, choose your adapter plus @fivo/office.

No CSS import is required in normal mode. Do not install framework adapters your host does not use.

## React 18 / 19

```tsx | pure
import { useRef } from 'react';
import { DocumentViewer } from '@fivo/react';
import { office } from '@fivo/office';
import type { ViewerHandle } from '@fivo/dom';

const plugins = [office({ worker: 'auto' })];
export function OfficePreview({ file }: { file?: File }) {
  const handle = useRef<ViewerHandle>(null);
  return (
    <section>
      <button
        onClick={() => void handle.current?.getCapabilities().zoom?.set(125)}
      >
        125%
      </button>
      <DocumentViewer
        ref={handle}
        source={file}
        plugins={plugins}
        options={{ height: 640, locale: 'en-US' }}
        onReady={(session) => console.info(session.getSnapshot())}
        onError={(error) => console.error(error)}
      />
    </section>
  );
}
```

Memoize dynamic plugin configuration, including the options used as dependencies. Plugin or creation-policy changes rebuild the viewer; theme, dimensions and zoom are view updates. Do not create viewers during render or assume effects run once in React StrictMode.

## Vue 3

```vue | pure
<script setup lang="ts">
import { shallowRef } from 'vue';
import { DocumentViewer } from '@fivo/vue';
import { office } from '@fivo/office';
import type { ViewerHandle } from '@fivo/dom';

defineProps<{ file?: File }>();
const handle = shallowRef<ViewerHandle>();
const plugins = [office()];
const options = { height: 640, locale: 'en-US' as const };
function onError(error: Error) {
  console.error(error);
}
</script>

<template>
  <DocumentViewer
    ref="handle"
    :source="file"
    :plugins="plugins"
    :options="options"
    @error="onError"
  />
</template>
```

The component exposes ViewerHandle methods. Subscribe after the template ref is mounted and unsubscribe on host teardown. KeepAlive activation/deactivation maps to setActive and preserves the session.

## Vue 2.6 / 2.7

Use Options API, without requiring script setup:

```vue | pure
<script>
import { DocumentViewer } from '@fivo/vue2';
import { office } from '@fivo/office';
const plugins = Object.freeze([office()]);
export default {
  components: { DocumentViewer },
  props: { file: { default: undefined } },
  data() {
    return { plugins, options: { height: 640, locale: 'en-US' } };
  },
  methods: {
    onError(error) {
      console.error(error);
    },
    zoomIn() {
      return this.$refs.preview.getCapabilities().zoom?.set(125);
    },
  },
};
</script>

<template>
  <DocumentViewer
    ref="preview"
    :source="file"
    :plugins="plugins"
    :options="options"
    @error="onError"
  />
</template>
```

Keep the plugin array stable and frozen. Do not store viewer/session objects in deep reactive data. Optional chaining requires host compiler support; Vue 2 compatibility does not imply support for unconfigured legacy bundlers or browsers.

## JavaScript and custom controls

```ts | pure
import { createViewer } from '@fivo/dom';
import { office } from '@fivo/office';

export function mountPreview(
  container: HTMLElement,
  file: File,
  zoomButton: HTMLButtonElement,
) {
  const viewer = createViewer(container, {
    plugins: [office()],
    height: 640,
    toolbar: false,
    onError: (error) => console.error(error),
  });
  const sync = () => {
    zoomButton.disabled = !viewer.getCapabilities().zoom;
  };
  const unsubscribe = viewer.subscribeCapabilities(sync);
  const zoom = () => {
    const capability = viewer.getCapabilities().zoom;
    if (capability)
      void capability
        .set(Math.min(capability.max, capability.value + capability.step))
        .catch(console.error);
  };
  zoomButton.addEventListener('click', zoom);
  sync();
  void viewer.open(file).catch(console.error);
  return async () => {
    unsubscribe();
    zoomButton.removeEventListener('click', zoom);
    await viewer.destroy();
  };
}
```

The container needs a usable size. Call the returned cleanup function on host unmount, not immediately after opening the file.

## Standard preset

```tsx | pure
import { DocumentViewer } from '@fivo/react';
import { standardPlugins } from '@fivo/viewer';
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

standardPlugins is a frozen array of Office, text, JSON, Markdown, image and PDF descriptors. Use your own stable plugin array for format-specific options; PDF asset deployment is described in the [image and PDF guide](./image-pdf). The preset does not import framework components or eagerly load format engines.

## Custom source factories

A factory returns a new DocumentSource lease, not a Response. Use it for dynamic authentication, custom caching or reads:

```ts | pure
import type { DocumentSource } from '@fivo/core';
const sourceFactory = (): DocumentSource => ({
  name: 'report.docx',
  async readAll(signal) {
    const response = await fetch('/api/report', {
      signal,
      credentials: 'include',
    });
    if (!response.ok)
      throw new Error('File request failed: ' + response.status);
    return new Uint8Array(await response.arrayBuffer());
  },
  async dispose() {
    // Release owned resources. This example owns no additional cache or handles.
  },
});
await viewer.open(sourceFactory);
```

Optional readRange(offset, length, signal) supports range reads; the current Office driver may still need the whole file. Respect AbortSignal and make disposal idempotent.

## Links, fonts and resources

```ts | pure
const plugins = [
  office({
    fonts: {
      aliases: { 'Company Font': ['Arial', 'sans-serif'] },
      fallbackFamilies: ['sans-serif'],
      sources: [
        {
          family: 'Company Font',
          src: 'url("/fonts/company.woff2") format("woff2")',
        },
      ],
      warnOnMissing: true,
    },
    media: { allowExternal: false, download: true },
    onHyperlinkActivate(event) {
      if (event.hyperlink.kind !== 'internal') event.preventDefault();
    },
    onWarning(warning) {
      console.warn(warning.code, warning.message);
    },
  }),
];
```

The host deploys licensed fonts. preventDefault blocks default navigation without weakening unsafe-URL rules. See Overview & API for Worker, CSP and resource-policy details.

## Common integration mistakes

- Blank preview: inspect container size, input types and onError before adding CSS.
- Repeated loads: keep plugin arrays and creation policies stable.
- Missing Vue callbacks: use ready/error events, not React onReady/onError props.
- Double parsing: avoid driving the same file through both source and handle.open.
- Reopening a destroyed instance: create a new viewer after destroy.
- Worker/CSP failures: provide an explicit factory/nonce where needed and test actual production asset URLs.

CSV/TSV、XML、Code 可使用独立 @fivo/csv、@fivo/xml、@fivo/code 插件；JSONC/JSONL/NDJSON 由 @fivo/json 处理，标准预设均已注册。默认参数、预算、懒加载与外部样式说明见[文本格式指南](./text-formats)。
