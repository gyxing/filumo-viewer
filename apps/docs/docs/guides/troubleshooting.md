---
title: Troubleshooting
description: Troubleshooting
keywords:
  - Filumo
  - API
siteLayout: docs
toc: content
---

# Troubleshooting

<div className="filumo-doc-callout" data-kind="limit">Diagnose the failing layer before changing parser, style or Worker configuration.</div>

## Blank preview

Check onError, source type and container height first. A string is a URL, not direct text. Verify that the server returns file bytes rather than a login/error HTML page. Do not add unrelated CSS before checking these inputs.

## Worker succeeds in development but fails in production

Inspect the actual Worker URL, HTTP status, JavaScript MIME and relative worker-chunks paths. For Vite use worker.format: 'es'. Office auto mode may fall back; always mode is useful to expose a deployment failure. Code highlighting has a different fallback policy. Keep engine and Worker resources aligned with their owning package version.

## Non-root or private deployment

Confirm the build-time base matches the published URL. Rebuild after a prefix change. A leading slash is relative to the origin, not the project directory. Inspect CORS/credentials and the real 206 metadata for a private PDF; do not assume a successful shell load proves file access.

## Encoding and source views

Use the encoding menu to retry detection or select the correct charset. A failed manual selection keeps the last successful content and shows a notice. JSON/XML parse diagnostics stay in their dedicated viewer; renaming or text fallback is not a repair for invalid structured data.

## Missing images, fonts or styles

Check Markdown baseUrl/resolveResource and verify mapped resources are authorized. Local File does not grant access to neighboring files. For external CSS, install matching DOM and active-format styles; keep the style marker and version aligned. Office font substitution can change pagination.

## Slow or large documents

Set a source maxFileBytes limit and the applicable format budgets. Inspect active canvases, caches and Worker tasks instead of inferring performance from DOM node count alone. Defaults are local budgets, not a promise about total browser memory or all document sizes.

## Lifecycle and duplicate opens

Keep plugins stable. Use either source props or imperative open for a given update. Subscribe after obtaining the handle and unsubscribe on unmount. destroy is terminal; recreate an instance to reopen. KeepAlive uses setActive without discarding the session.

## Reporting a reproducible issue

Include package versions, browser, host builder/version, error code, actual failing resource status and sanitized steps. Report whether the problem occurs in development and production. Never attach private documents, passwords or authentication headers to a public issue. [Viewer API](./viewer-api) lists common Core error codes.
