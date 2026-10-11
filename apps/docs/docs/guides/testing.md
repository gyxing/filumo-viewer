---
title: Fivo Development and Testing
siteLayout: docs
toc: content
---

# Development and testing

Public docs, private smoke tests, isolated hosts and automated regressions serve different purposes. Passing scripts is not proof that every visual scenario is identical; select checks relevant to the change.

## Environment

Use Node.js 22 and pnpm 11.10.0 as pinned in package.json. Do not install repository dependencies with a different manager or hand-edit the lockfile.

```sh
pnpm install --frozen-lockfile
pnpm build
```

## Everyday commands

| Command         | Use                            | Notes                                           |
| --------------- | ------------------------------ | ----------------------------------------------- |
| pnpm docs:dev   | Documentation development      | Home, Playground, docs and Chinese counterparts |
| pnpm smoke      | Private local-file smoke tests | React adapter at /dev/smoke-test                |
| pnpm demo:js    | JavaScript example             | Real build output, no React                     |
| pnpm demo:react | React example                  | @fivo/react integration                         |
| pnpm demo:vue3  | Vue 3 example                  | Native Office and KeepAlive                     |
| pnpm demo:vue2  | Vue 2 example                  | Options API                                     |
| pnpm docs:build | Production documentation build | Writes apps/docs/dist; does not deploy          |

pnpm demo defaults to JavaScript. Port 4173 is the default. For simultaneous demos, choose a different port, for example pnpm demo:vue3 --port 4174.

## Hot-reload boundary

docs:dev and smoke build packages once before starting. dumi page code can hot-reload; packages do not yet have a watch pipeline. Rebuild after package-source changes and restart demos. A stale page does not require duplicating CSS or introducing another bundler.

Playground tabs select integration code, not the framework running the page. Use the separate demos to verify actual framework integration.

## Automated checks

| Command                             | Coverage                                                 |
| ----------------------------------- | -------------------------------------------------------- |
| pnpm check:types                    | Package and documentation TypeScript checks              |
| pnpm check:lint / pnpm check:styles | TypeScript/JSX and Less rules                            |
| pnpm test                           | Existing unit/contract tests                             |
| pnpm test:consumers                 | Packing, isolated installs and real consumers            |
| pnpm test:browser                   | Public fixtures and browser regressions                  |
| pnpm test:browser:local             | Private local fixtures, isolated reports                 |
| pnpm test:acceptance                | Audit migration evidence, not a substitute for real runs |

Install a browser and run the focused docs suite:

```sh
pnpm exec playwright install chromium
pnpm docs:build
pnpm test:browser docs.spec.mjs
```

An installed Edge can be selected with FIVO_BROWSER_CHANNEL=msedge. Linux CI uses --with-deps when installing Chromium. Report the actual scope when running a subset of tests.

## Fixtures and privacy

Public fixtures are generated DOCX/XLSX/PPTX and pagination samples without business data. Private files belong in ignored tests/fixtures/local and are served only by local smoke endpoints. Production builds do not register the smoke route or publish private documents.

Keep private-file screenshots, logs and reports in local-only output directories. Browser-local input does not make a screenshot non-sensitive.

## Routes and deployment base

The default base is /. English docs use /docs, Chinese docs /zh-CN/docs, with guides under docs/guides. Playground uses /playground and /zh-CN/playground. Smoke pages are development-only.

```powershell
# Change this terminal only, not system configuration.
$env:FIVO_DOCS_BASE = '/preview/'
pnpm docs:build
pnpm test:browser docs.spec.mjs
Remove-Item Env:FIVO_DOCS_BASE
```

Build, test server and tests must share FIVO_DOCS_BASE. Rebuild after changing it instead of merely prefixing the browser URL. The Pages workflow sets its deployment directory; local routes do not require the old package-name prefix.

## Build maintenance

- esbuild builds component packages; dumi builds the docs app. There is no Father or second package build pipeline.
- Package manifests own versions; generated/package.ts is script-generated, not maintained manually.
- Less becomes lazy automatic CSS; external CSS has deterministic ordering and package-version scopes.
- Office public declarations have a separate entry while all implementation sources are type-checked.
- `pnpm build <package>` resolves workspace prerequisites automatically; `pnpm test:consumers` consumes all seven tarballs directly and `pnpm test:consumers:hosts` checks npm/Yarn hosts.
- worker.js is the public Worker asset. Build manifests use metafile output instead of fixed hashed chunk names.
- Publishing and Git history changes require explicit authorization.

## Visual acceptance

Check docs navigation, contents, reading width, tables, code, locale switches and anchors. Check Playground configuration/code synchronization, reset, copy, file selection and narrow layouts.

Component UI regressions should enable the default toolbar and cover image overlays, themes and real built framework consumers. Source-only style tests cannot prove version-scoped production CSS works.
