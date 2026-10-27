# @filumo/vue

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Vue 3 document viewer adapter for Filumo, with typed component methods, plugin-based formats and KeepAlive lifecycle support.

A Filumo adapter for Vue 3 using Composition API and native render functions. The component itself does not require an additional SFC compilation plugin.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Exports DocumentViewer, viewer configuration and handle types without bundled format plugins.
- Supports mount/unmount and KeepAlive activation/deactivation while reusing the framework-independent DOM viewer.
- Synchronizes source, options and plugins as declared. Keep the plugin list stable.

## Installation

```sh
pnpm add @filumo/vue @filumo/office
```

Or with npm:

```sh
npm install @filumo/vue @filumo/office
```

Use the example in a host project already configured for the corresponding framework. Supported framework versions are listed below.

## Minimal integration

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import { DocumentViewer } from '@filumo/vue';
import { office } from '@filumo/office';

const file = shallowRef<File>();
const plugins = [office()];
const options = { height: 640 };
function chooseFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0];
}
function onError(error: Error) {
  console.error(error);
}
</script>

<template>
  <section>
    <input type="file" @change="chooseFile" />
    <DocumentViewer
      :source="file"
      :plugins="plugins"
      :options="options"
      @error="onError"
    />
  </section>
</template>
```

## Common options

| Option                             | Default                     | Description                                                                               |
| ---------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `source`                           | Optional                    | Browser document input.                                                                   |
| `plugins`                          | Required                    | Format plugin array; keep the reference stable.                                           |
| `options`                          | Default shell configuration | ViewerConfiguration including height, theme, locale and resource limits.                  |
| `ready / error`                    | Events                      | Session ready or loading error.                                                           |
| `stateChange / capabilitiesChange` | Events                      | State and format capability changes.                                                      |
| `Component ref`                    | Optional                    | Exposes open, update, getSnapshot, getCapabilities, setActive, destroy and other methods. |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Lifecycle and Vue versions

The peer dependency is vue >=3.3 <4. The example uses an SFC to demonstrate host integration; the component itself uses render functions. Wait for onMounted before calling public component ref methods, and do not access internal viewer fields.

KeepAlive deactivation pauses the view; reactivation continues the session; beforeUnmount releases the instance. Keep plugins stable and avoid deeply proxying parsers, Workers and other runtime objects. Do not create a browser viewer during SSR.

## Format selection and styles

The example registers only Office. For the full preset, install @filumo/viewer directly and pass standardPlugins. The adapter does not register formats itself. PDF uses matching bundled resources by default; only custom external deployment requires a resource directory.

DOM and format packages load styles in auto mode. External mode imports @filumo/dom/styles.css and the actual format styles.css; Office image overlays also need Image CSS. The Vue adapter has no separate styles.css.

## Inputs and runtime environment

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry  | Purpose                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| `@filumo/vue` | DocumentViewer and types including DocumentInput, ViewerHandle and ViewerConfiguration |

Unlisted internal paths are not stable public APIs. Standalone format packages do not depend on React/Vue adapters; install only the formats and adapter your host needs.

## Filumo packages

The current package is bold. Each package is published independently. Package names link to npm, and source links point to this repository.

<!-- filumo-packages:start -->

| Package (npm)                                                      | Purpose                                                                 | Source documentation                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | Headless sources, plugin contracts, sessions and shared text utilities  | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | Native DOM viewer, toolbars, source views, outlines and shared UI       | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | Standard preset and factories for ten format plugins                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.md)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word, Excel, PowerPoint and supported legacy formats                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.md)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | Continuous PDF reading, outlines, thumbnails and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | Image preview, zoom, rotation, panning and shared overlays              | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.md)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | Plain text, logs, encoding detection and readable-text fallback         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.md)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON / JSONC / JSONL / NDJSON source and structure views                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.md)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown reading, outlines, GFM layout and code highlighting            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.md) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | CSV / TSV read-only grids, virtual scrolling and search                 | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | XML source, namespace-aware structure trees and node navigation         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.md)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | Read-only highlighting for code, scripts, configuration and stylesheets | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 adapter                                                     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.md)    |
| **[@filumo/vue](https://www.npmjs.com/package/@filumo/vue)**       | Vue 3 (>=3.3 <4) adapter                                                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2 (^2.6.14 or ^2.7.16) adapter                                      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.md)     |
| [@filumo/archive](https://www.npmjs.com/package/@filumo/archive)   | Archive directories, on-demand extraction and child previews            | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.md)  |

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/vue/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/LICENSE)
