# @filumo/vue2

<p>
<strong>English</strong> | <a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.zh-CN.md">简体中文</a> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">Live demo</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">Integration docs</a>
</p>

Vue 2 document viewer adapter for Filumo, with Options API integration, plugin-based formats and managed lifecycle cleanup.

A Filumo adapter for Vue 2.6/2.7 using Options API and native render functions, with the same format plugins as Vue 3 and React.

This documentation covers **0.1.0**. The commands below describe consumption after publication to npm. When using this source workspace, build the packages first as described in the integration guide.

## Features

- Uses Vue.extend. The component name is FilumoDocumentViewer and the export is DocumentViewer.
- Stores runtime viewers in an internal WeakMap outside Vue 2 deep reactivity. Destruction releases resources.
- Supports keep-alive activation/deactivation. Freeze the host plugin array or keep it outside deep reactivity.

## Installation

```sh
pnpm add @filumo/vue2 @filumo/office
```

Or with npm:

```sh
npm install @filumo/vue2 @filumo/office
```

Use the example in a host project already configured for the corresponding framework. Supported framework versions are listed below.

## Minimal integration

```vue
<script>
import { DocumentViewer } from '@filumo/vue2';
import { office } from '@filumo/office';

const plugins = Object.freeze([office()]);
export default {
  components: { DocumentViewer },
  data() {
    return { file: undefined, plugins, options: { height: 640 } };
  },
  methods: {
    chooseFile(event) {
      this.file = event.target.files && event.target.files[0];
    },
    onError(error) {
      console.error(error);
    },
  },
};
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
| `source`                           | undefined                   | Browser document input; changes open a new file.                                          |
| `plugins`                          | Required                    | Format plugin array; Object.freeze is recommended to keep it stable.                      |
| `options`                          | Default shell configuration | ViewerConfiguration including height, theme, locale and resource policy.                  |
| `ready / error`                    | Events                      | Session ready or loading error.                                                           |
| `stateChange / capabilitiesChange` | Events                      | State and toolbar capability changes.                                                     |
| `Component ref`                    | Optional                    | Exposes open, update, setActive, getSnapshot, getCapabilities, destroy and other methods. |

See the public declarations and source for complete types. Features cannot be enabled by guessing undocumented option names.

## Lifecycle and Vue versions

The peer dependency is vue ^2.6.14 || ^2.7.16. The component creates the viewer on mounted and destroys it on beforeDestroy. Keep-alive deactivation/reactivation reuses the session. Wait for mounting before calling public methods through $refs.

The example freezes the plugin array to avoid Vue 2 deep observation of descriptors that need no reactivity. Resources, Workers and handles are managed by the component and should not enter serializable host state. Mount the viewer on the client only.

## Format selection and styles

The example registers only Office. Full format support requires directly installing @filumo/viewer and passing standardPlugins. The Vue 2 package does not implicitly install React or provide editing.

DOM and format packages load styles by default. External mode imports @filumo/dom/styles.css and the actual format styles.css; Office image overlays also need Image CSS. Vue 2 has no separate styles.css. PDF uses matching bundled resources by default; only custom external deployment requires a resource directory.

## Inputs and runtime environment

String input represents a URL, not document content. Use File/Blob for inline text. Other sources include Uint8Array, URL objects with name/mimeType/request, and custom DocumentSource factories. Remote files and supporting resources must satisfy the host's networking, CORS and CSP configuration.

Packages are published as ESM with TypeScript declarations and no CommonJS require entry. Viewer mounting, image decoding and file selection run in the browser. Importing a lightweight entry does not enable server-side document rendering. Create instances in the client lifecycle and destroy them when no longer needed.

## Public entries

| Public entry   | Purpose                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| `@filumo/vue2` | DocumentViewer and types including DocumentInput, ViewerHandle and ViewerConfiguration |

Unlisted internal paths are not stable public APIs. Standalone format packages do not depend on React/Vue adapters; install only the formats and adapter your host needs.

## Filumo packages

The current package is bold. Each package is published independently. Package names link to npm, and source links point to this repository.

<!-- filumo-packages:start -->

| Package (npm)                                                      | Purpose                                                                 | Source documentation                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | Headless sources, plugin contracts, sessions and shared text utilities  | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | Native DOM viewer, toolbars, source views, outlines and shared UI       | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | Standard preset and factories for nine format plugins                   | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.md)   |
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
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3 (>=3.3 <4) adapter                                                | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.md)      |
| **[@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)**     | Vue 2 (^2.6.14 or ^2.7.16) adapter                                      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.md)     |

<!-- filumo-packages:end -->

## Documentation and feedback

- [Source and complete types](https://github.com/gyxing/filumo-viewer/tree/master/packages/vue2/src)
- [Framework integration](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.md)
- [Format capabilities and limits](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.md)
- [Text-based formats](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.md)
- [Images and PDF deployment](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.md)
- [Standalone framework examples](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [Changelog](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [Report an issue](https://github.com/gyxing/filumo-viewer/issues)
- [MIT license](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/LICENSE)
