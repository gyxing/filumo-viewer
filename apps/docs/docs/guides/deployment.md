---
title: Production deployment
description: Production deployment
keywords:
  - Filumo
  - API
siteLayout: docs
toc: content
---

# Production deployment

<div className="filumo-doc-callout" data-kind="deployment">Verify production resource paths and source authentication before shipping.</div>

## Vite and Webpack

Use ESM packages and preserve Worker-relative chunks. The default PDF configuration is pdf(); no public asset copy is required.

```ts | pure
import { defineConfig } from 'vite';
export default defineConfig({ worker: { format: 'es' } });
```

Webpack 5 understands new Worker(new URL(..., import.meta.url)). Keep the package ESM entry and use output.publicPath: 'auto' when the host chooses asset paths dynamically. Do not run emitted Worker chunks as ordinary scripts or rewrite their imports to CommonJS. See [image/PDF overrides](./image-pdf) only when you deliberately deploy external resources.

## Authentication and remote files

```ts | pure
import { createViewer } from '@filumo/dom';
import { pdf } from '@filumo/pdf';
export async function mountPrivatePdf(container: HTMLElement, url: string) {
  const viewer = createViewer(container, { plugins: [pdf()], height: 640, onError: console.error });
  await viewer.open({ url, name: 'report.pdf', request: { credentials: 'include' } });
  return () => viewer.destroy();
}
```

The server must allow the actual application origin and credentials. Do not use wildcard Access-Control-Allow-Origin with credentialed requests. Return the file bytes, not an HTML login page, and keep long-lived secrets out of URLs and logs.

## PDF Range responses

Efficient remote reading requires real 206 responses and valid Content-Range. Expose the response metadata needed by the browser: Content-Range, Accept-Ranges, ETag and Last-Modified. Preserve authentication on both the initial request and later ranges. Unsupported Range falls back to full reading; a method named readRange alone does not prove bandwidth savings.

## Markdown images and links

Local File sources have no usable adjacent-file URL. Supply an explicit base or resource map.

```ts | pure
import { markdown } from '@filumo/markdown';
const resources = new Map([['./diagram.png', '/api/images/42']]);
const plugin = markdown({
  baseUrl: document.baseURI,
  resolveResource(reference, kind, signal) {
    if (signal.aborted) return undefined;
    return kind === 'image' ? resources.get(reference) : reference;
  },
});
```

An undefined result blocks that resource; it does not fall back to the original reference. Returned URLs still pass protocol checks. The host must authorize mapped resources and revoke any object URLs it creates when they are no longer used.

## Styles and CSP

Auto mode uses the host nonce for style elements. External mode requires direct installation and imports of DOM and active-format styles.css; Office image overlays additionally need Image CSS. Dynamic document positioning still uses style attributes, so coordinate style-src-attr with the host policy. Do not disable the site CSP to hide a styling problem.

## Client rendering and verification

Create viewers and open browser File sources on the client. React/Next.js uses a client component; Nuxt can use a .client.vue component or ClientOnly. [Framework integration](./preview-integration) includes examples. These are integration recipes, not a claim that every SSR framework/version has passed acceptance.

Validate a production build with the real base URL, a real Worker, one private file and a destroy/reopen cycle. [Troubleshooting](./troubleshooting) describes symptom-based checks.
