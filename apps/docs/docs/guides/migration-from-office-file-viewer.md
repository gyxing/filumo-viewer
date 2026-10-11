---
title: Migration to Fivo
siteLayout: docs
toc: content
---

# Migration to Fivo

Fivo has new packages and public contracts. **Old entry points are not supported.** The goal is cross-framework rendering, lazy loading and automatic styles, without carrying a compatibility layer for the old API.

## Package choices

| Previous usage                        | New integration                                                 |
| ------------------------------------- | --------------------------------------------------------------- |
| React OfficeFileViewer                | DocumentViewer from @fivo/react plus office() from @fivo/office |
| Previous layout subpath               | createViewer and capabilities from @fivo/dom                    |
| Vue wrapper around React              | @fivo/vue or @fivo/vue2 using native Office rendering           |
| Internal parsers or deep dist imports | Public Core protocols; avoid internal format models             |

@fivo/viewer exports standardPlugins for the Office-only preset. It is not a component bundle containing all frameworks.

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
import { DocumentViewer } from '@fivo/react';
import { office } from '@fivo/office';
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

Remove old package CSS imports and Less configuration used only for that package. Normal Fivo usage automatically loads styles.

For strict CSP, choose stylePolicy.nonce or explicit external mode. External mode needs matching @fivo/dom/styles.css and @fivo/office/styles.css. Use the current Worker asset or workerFactory, not old generated chunk filenames.

## Lifecycle and interactions

Adapters clean up on unmount; native hosts call destroy. Vue KeepAlive pauses presentation while retaining the session. A destroyed instance cannot be reopened; setActive(false) is only a pause.

Capabilities can be absent for a document. Do not assume every format has page controls. Use action IDs and their options for worksheets, revisions and presentation notes.

## Excluded compatibility

Old uri/parseOptions/defaultViewState APIs, React-bound Office internals, legacy entry aliases, deep dist imports and undocumented format models are not restored. Current functionality remains read-only preview without edited-document saving.

Validate production bundling, sources, Workers, image overlays, search, teardown and deployment prefixes in the target host. A successful type check or static home page is not complete migration acceptance.
