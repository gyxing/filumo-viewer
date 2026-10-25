---
title: Filumo documentation
description: Getting started, APIs, format guides, deployment and troubleshooting.
keywords:
  - Filumo
  - file preview
  - document viewer
siteLayout: docs
toc: content
---

# Filumo documentation

The documentation follows the repository. Check each package on npm for published versions; source capabilities are not a claim that every browser or framework has been verified.

<nav className="office-viewer-docs__quick-links" aria-label="Documentation shortcuts"><a href="#quick-start">Quick start</a><a href="#viewer-options">Viewer options</a><a href="#capabilities">Capabilities</a><a href="#office-options">Office options</a><a href="#development">Development</a></nav>

## Getting started

Choose a framework adapter and the required plugins. The standard preset includes nine lightweight format descriptors.

- [Quick start](./guides/quick-start)
- [Packages and installation](./guides/packages)

## Framework integration

[React, Vue 3, Vue 2 and JavaScript](./guides/preview-integration) covers mounting, stable plugin arrays, lifecycle and SSR client boundaries.

## Formats and reading

- [Complete format list and compatibility](./guides/compatibility)
- [Images and PDF](./guides/image-pdf)
- [Text, JSON, Markdown, CSV, XML and Code](./guides/text-formats)

## API reference

- [Viewer API](./guides/viewer-api): sources, configuration, methods, events and capability actions.
- [Plugin options](./guides/plugin-api): field types, defaults, units and callback differences for every format.

## Deployment and troubleshooting

- [Production deployment](./guides/deployment): Vite/Webpack, Workers, CSP, credentials, PDF Range and Markdown resources.
- [Troubleshooting](./guides/troubleshooting): diagnose blank previews, asset errors, encoding and memory limits.

## Maintenance and extensions

- [Development and testing](./guides/testing), including independent npm releases.
- [Plugin contracts](./guides/extension-contracts) and the boundary of future editing.
- [Migration to Filumo](./guides/migration)

Previews are read-only. Macros and source code are not executed; saving edited files, OCR and formula recalculation are outside the current scope.
