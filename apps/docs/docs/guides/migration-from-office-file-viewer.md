---
title: Migration to Filumo
description: Migrate package scopes, APIs, styles, Workers and lifecycle integration to Filumo 0.1.0.
keywords:
  - Filumo
  - file preview
  - document viewer
  - browser
siteLayout: docs
toc: content
---

# Migration to Filumo

Filumo has new packages and public contracts. **Old entry points are not supported.** The goal is cross-framework rendering, lazy loading and automatic styles, without carrying a compatibility layer for the old API.

## Package choices

| Previous usage                        | New integration                                                     |
| ------------------------------------- | ------------------------------------------------------------------- |
| React OfficeFileViewer                | DocumentViewer from @filumo/react plus office() from @filumo/office |
| Previous layout subpath               | createViewer and capabilities from @filumo/dom                      |
| Vue wrapper around React              | @filumo/vue or @filumo/vue2 using native Office rendering           |
| Internal parsers or deep dist imports | Public Core protocols; avoid internal format models                 |

@filumo/viewer exports standardPlugins for Office, text, JSON, Markdown, images and PDF. The preset contains lightweight descriptors and does not bundle framework components or eagerly load format engines.

## Configuration mapping

| Previous concept                | Current API                                       | Important difference                               |
| ------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| uri                             | source / viewer.open(input)                       | Adapt to DocumentInput                             |
| parseOptions                    | office({ worker, workerFactory, resourcePolicy }) | Format policy belongs to the plugin                |
| theme.mode                      | options.theme                                     | light / dark                                       |
| height                          | options.height                                    | Defaults to 560px; percentage needs a sized parent |
| locale                          | options.locale                                    | zh-CN / en-US                                      |
| defaultViewState.zoom           | options.zoom                                      | Or capabilities.zoom.set                           |
| Custom toolbar callback         | toolbar: false plus capability subscriptions      | Host owns custom controls                          |
| onPreviewReady / onFileParsed   | onReady plus state/session subscriptions          | Readiness semantics differ                         |
| onWarning / onHyperlinkActivate | Callbacks inside office(options)                  | Not DocumentViewer top-level props                 |

A previous async source returning Response must become a Blob, Uint8Array, URL descriptor or DocumentSource factory.

## React example

```tsx | pure
import { DocumentViewer } from '@filumo/react';
import { office } from '@filumo/office';
const plugins = [office({ worker: 'auto' })];
export function Preview({ file }: { file?: File }) {
  return (
    <DocumentViewer
      source={file}
      plugins={plugins}
      options={{ height: 640, theme: 'light' }}
    />
  );
}
```

Keep plugins stable. Do not create a fresh array every render or open the same source through both props and imperative calls.

## Styles and Workers

Remove old package CSS imports and Less configuration used only for that package. Normal Filumo usage automatically loads styles.

For strict CSP, choose stylePolicy.nonce or explicit external mode. External mode needs matching @filumo/dom/styles.css, @filumo/image/styles.css and @filumo/office/styles.css. Use the current Worker asset or workerFactory, not old generated chunk filenames.

## Lifecycle and interactions

Adapters clean up on unmount; native hosts call destroy. Vue KeepAlive pauses presentation while retaining the session. A destroyed instance cannot be reopened; setActive(false) is only a pause.

Capabilities can be absent for a document. Do not assume every format has page controls. Use action IDs and their options for worksheets, revisions and presentation notes.

## Excluded compatibility

Old uri/parseOptions/defaultViewState APIs, React-bound Office internals, legacy entry aliases, deep dist imports and undocumented format models are not restored. Current functionality remains read-only preview without edited-document saving.

Validate production bundling, sources, Workers, image overlays, search, teardown and deployment prefixes in the target host. A successful type check or static home page is not complete migration acceptance.

## Scope and version alignment

Public packages use `@filumo/*` at `0.1.0`, CSS uses `filumo-` prefixes, the public error is `FilumoError`, and project environment variables use `FILUMO_*`. Update old identifiers in custom controls, CSP configuration and deployment scripts. Do not edit generated/package.ts or copy old build caches.

The GitHub repository is now [gyxing/filumo-viewer](https://github.com/gyxing/filumo-viewer), and the Pages base is /filumo-viewer/. npm package names remain @filumo/*. See the [package overview](./packages).
