---
title: Fivo Plugins and Future Editing
siteLayout: docs
toc: content
---

# Plugins and future editing

Office preview is the only shipped implementation in this workspace. This guide describes the existing extension protocol and future editing boundary, not published PDF, text or editor packages.

## Layer responsibilities

| Layer         | Owns                                        | Does not own                         |
| ------------- | ------------------------------------------- | ------------------------------------ |
| Core          | Sources, selection, cancellation, sessions  | DOM, React/Vue or format layout      |
| DOM           | Host shell, capabilities, style leases      | Office internal models               |
| Format plugin | Detection, parsing, resources, format views | Host framework lifecycle             |
| Adapter       | Props/events, mounting, teardown, KeepAlive | A second parser or duplicate toolbar |

Future formats can live in separate @fivo/\* packages when needed. Hosts register them explicitly. Adding a package does not silently expand the standard preset or other consumers' dependencies.

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
import { createSession } from '@fivo/core';
import type { ViewerPlugin } from '@fivo/dom';
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

## Future editing and saving

Sources, sessions, capabilities and adapters are reusable foundations. Editing still needs a command model, dirty state, history, permissions and format-writing capabilities.

There is no editor, save, applyChanges or undo API today. Do not mutate internal preview models as editor state or treat revision projection as modification of original bytes.

exportOriginal returns original content only. Saving edited documents requires a format writer, output validation and host persistence. Define those contracts when real editing requirements exist rather than publishing empty editor packages.

## Public boundary

Package exports define supported imports. Do not depend on src, dist/chunks, private Worker messages or parser internals. New plugins should independently verify safe imports, lazy loading, style isolation, cancellation and framework consumption.
