---
title: Filumo Plugins and Future Editing
description: Filumo DocumentPlugin and ViewerPlugin contracts, shared text and DOM views, resource ownership and readonly boundaries.
keywords:
  - Filumo
  - file preview
  - document viewer
  - browser
siteLayout: docs
toc: content
---

# Plugins and future editing

The unpublished 0.1.0 workspace contains nine readonly plugins: Office, text, JSON, Markdown, image, PDF, CSV, XML and code. This guide describes their shared protocol and the future editing boundary.

## Layer responsibilities

| Layer         | Owns                                        | Does not own                         |
| ------------- | ------------------------------------------- | ------------------------------------ |
| Core          | Sources, selection, cancellation, sessions  | DOM, React/Vue or format layout      |
| DOM           | Host shell, capabilities, style leases      | Office internal models               |
| Format plugin | Detection, parsing, resources, format views | Host framework lifecycle             |
| Adapter       | Props/events, mounting, teardown, KeepAlive | A second parser or duplicate toolbar |

Future formats can live in separate @filumo/\* packages when needed. Hosts register them explicitly. Adding a package does not silently expand the standard preset or other consumers' dependencies.

Shared text processing comes from @filumo/core/text; source, outline and split views come from DOM subentries without a reverse dependency on Text. See the [package overview](./packages).

## DocumentPlugin

| Field                        | Contract                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| id                           | Stable unique plugin identity                                      |
| protocolVersion              | Currently 1                                                        |
| extensions / mimeTypes       | Metadata hints                                                     |
| priority                     | Optional priority; higher values are probed first                  |
| detect(source, signal)       | Lightweight cancellable detection returning Promise&lt;boolean&gt; |
| load()                       | Load a DocumentDriver on demand                                    |
| driver.open(source, context) | Create a DocumentSession                                           |

Without an explicit pluginId, Core orders candidates using metadata and probes them. Explicit IDs must be registered. Duplicate IDs, mismatched protocols and unknown IDs fail explicitly.

## ViewerPlugin

ViewerPlugin contains document and loadView(). The view factory mounts with a context and returns update, setActive and dispose.

This minimal custom .note plugin illustrates the protocol only:

```ts | pure
import { createSession } from '@filumo/core';
import type { ViewerPlugin } from '@filumo/dom';
export const notePlugin: ViewerPlugin = {
  document: {
    id: 'note-example',
    protocolVersion: 1,
    extensions: ['.note'],
    mimeTypes: ['text/plain'],
    async detect(source) {
      return source.name?.endsWith('.note') === true;
    },
    async load() {
      return {
        async open(source, context) {
          const bytes = await source.readAll(context.signal);
          return createSession({
            ...context,
            source,
            format: 'note',
            data: new TextDecoder().decode(bytes),
          });
        },
      };
    },
  },
  async loadView() {
    return {
      async mount(context) {
        const text = context.container.ownerDocument.createElement('pre');
        text.textContent = String(context.session.data);
        context.container.append(text);
        context.setCapabilities({});
        return {
          update() {},
          setActive(active) {
            text.hidden = !active;
          },
          async dispose() {
            text.remove();
          },
        };
      },
    };
  },
};
```

Use textContent rather than executing untrusted document text as HTML. Real plugins put heavy parser/view modules behind dynamic imports and dispose late results after cancellation.

## Sessions and ownership

DocumentSession exposes id, signal, source, data, getSnapshot, subscribe, cancel and dispose. Format data should not depend on a framework component; cross-thread data must be serializable.

Each source, Worker, object URL, font, chart and subscription needs an owner. Release resources on replacement, failure and unmount. Core isolates late sessions from parsers that ignore cancellation, but plugins should still respect signals.

## Capabilities

Views publish zoom, navigation, search and actions with context.setCapabilities. Advertise only implemented features; formats without pages must not invent page counts. The default shell and custom host UI consume the same snapshots.

Actions carry id, label, kind, enabled, pressed/value/options and run. Page indices are zero-based; worksheets use stable IDs instead of names as identity.

Actions, zoom and navigation accept optional toolbar presentation metadata without removing callable capabilities. visible: false hides a default control. order sorts ascending with stable ties. placement: main prefers the main row; more always uses the overflow menu. Lower priority values move into overflow first. Missing fields retain existing defaults. Action showLabel: false hides the external select label while retaining its accessible name.

navigation.toolbar.layout defaults to paging; buttons shows only previous/next controls, with optional previousLabel and nextLabel. zoom.presets supplies percentages; zoom.mode carries value, options and asynchronous set(value). The plugin interprets option values. A mode is active when value matches an option; otherwise the percentage is manual.

```ts | pure
context.setCapabilities({
  actions: [
    {
      id: 'custom.inspect',
      label: 'Inspect',
      kind: 'action',
      toolbar: { order: 10, placement: 'main' },
      run: () => console.info('Inspect document'),
    },
  ],
  navigation: {
    index: 0,
    count: 3,
    toolbar: { visible: false },
    goTo: async (index) => console.info(index),
  },
});
```

Existing plugins need no changes when omitting toolbar, presets and mode. Custom host UI can ignore default presentation metadata and call the capabilities directly.

## Future editing and saving

Sources, sessions, capabilities and adapters are reusable foundations. Editing still needs a command model, dirty state, history, permissions and format-writing capabilities.

There is no editor, save, applyChanges or undo API today. Do not mutate internal preview models as editor state or treat revision projection as modification of original bytes.

exportOriginal returns original content only. Saving edited documents requires a format writer, output validation and host persistence. Define those contracts when real editing requirements exist rather than publishing empty editor packages.

## Public boundary

Package exports define supported imports. Do not depend on src, dist/chunks, private Worker messages or parser internals. New plugins should independently verify safe imports, lazy loading, style isolation, cancellation and framework consumption.
