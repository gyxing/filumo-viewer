---
title: Filumo Development and Testing
description: Filumo source development, smoke workflows, production artifacts, deployment bases and GitHub Pages publication.
keywords:
  - Filumo
  - file preview
  - document viewer
  - browser
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

| Command | Use | Notes |
| --- | --- | --- |
| pnpm docs:dev | Documentation development | Home, Playground, docs and Chinese counterparts |
| pnpm smoke | Private local-file smoke tests | Opens the /dev/smoke-test workbench by default |
| pnpm demo:js | JavaScript example | Real build output, no React |
| pnpm demo:react | React example | @filumo/react integration |
| pnpm demo:vue3 | Vue 3 example | Native Office and KeepAlive |
| pnpm demo:vue2 | Vue 2 example | Options API |
| pnpm docs:build | Production documentation build | Writes apps/docs/dist; does not deploy |

pnpm demo defaults to JavaScript. Port 4173 is the default. For simultaneous demos, choose a different port, for example pnpm demo:vue3 --port 4174.

## Hot-reload boundary

docs:dev and smoke compile workspace package sources directly. Startup prepares metadata, public fixtures and PDF assets without building every package. dumi updates page code; the development plugin refreshes package view, style and Worker changes to release old sessions. New entries, dependencies or build configuration can still require a restart. Standalone demos consume build output and need rebuilding/restarting after package-source changes.

Playground tabs select integration code, not the framework running the page. Use the separate demos to verify actual framework integration.

The smoke workbench covers Office and additional formats, with fixture filtering, local file selection, format options and event logs. Private endpoints exist only in development smoke mode. The public Playground uses public plugins without accessing private fixture directories.

## Automated checks

| Command | Coverage |
| --- | --- |
| pnpm check:types | Package and documentation TypeScript checks |
| pnpm check:lint / pnpm check:styles | TypeScript/JSX and Less rules |
| pnpm test | Existing unit/contract tests |
| pnpm test:consumers | Packing, isolated installs and real consumers |
| pnpm test:browser | Public fixtures and browser regressions |
| pnpm test:browser:local | Private local fixtures, isolated reports |
| pnpm test:acceptance | Audit migration evidence, not a substitute for real runs |

Install a browser and run the focused docs suite:

```sh
pnpm exec playwright install chromium
pnpm docs:build
pnpm test:browser docs.spec.mjs
```

An installed Edge can be selected with FILUMO_BROWSER_CHANNEL=msedge. Linux CI uses --with-deps when installing Chromium. Report the actual scope when running a subset of tests.

## Fixtures and privacy

Public fixtures include generated Office, image, PDF, text and structured-format files without business data. Private files belong in ignored tests/fixtures/local and are served only by local smoke endpoints. Production builds do not register the smoke route or publish private documents.

Keep private-file screenshots, logs and reports in local-only output directories. Browser-local input does not make a screenshot non-sensitive.

## Routes and deployment base

The default base is /. English docs use /docs, Chinese docs /zh-CN/docs, with guides under docs/guides. Playground uses /playground and /zh-CN/playground. Smoke pages are development-only.

```powershell
# Change this terminal only, not system configuration.
$env:FILUMO_DOCS_BASE = '/preview/'
pnpm docs:build
pnpm test:browser docs.spec.mjs
Remove-Item Env:FILUMO_DOCS_BASE
```

Build, test server and tests must share FILUMO_DOCS_BASE. Rebuild after changing it instead of merely prefixing the browser URL. The Pages workflow sets its deployment directory; local routes do not require the old package-name prefix.

## GitHub Pages publication

The public site is https://gyxing.github.io/filumo-viewer/, with FILUMO_DOCS_BASE set to /filumo-viewer/ for the gyxing/filumo-viewer repository. Rebuild and deploy the documentation after changing this prefix.

.github/workflows/deploy-pages.yml listens to pushes on master and keeps a workflow_dispatch entry. Local next-branch changes do not update the public site. CI installs from the lockfile, runs pnpm run docs:build, uploads apps/docs/dist and deploys it. A manual run uses the selected ref, so select the intended version deliberately.

Source edits and production builds do not publish by themselves. Git writes, pushes and workflow runs require authorization. The docs build prepares matching bundled PDF assets and excludes local smoke routes without using a public-directory copy to mask default loading failures.

## Build maintenance

- esbuild builds component packages; dumi builds the docs app. There is no Father or second package build pipeline.
- Package manifests own versions; generated/package.ts is script-generated, not maintained manually.
- Less becomes lazy automatic CSS; external CSS has deterministic ordering and package-version scopes.
- Office public declarations have a separate entry while all implementation sources are type-checked.
- `pnpm build <package>` resolves workspace prerequisites automatically; `pnpm test:consumers` validates its selected package combinations and `pnpm test:consumers:hosts` checks npm/Yarn hosts.
- worker.js is the public Worker asset. Build manifests use metafile output instead of fixed hashed chunk names.
- Publishing and Git history changes require explicit authorization.

## Independent npm releases

The fifteen public packages have independent versions. Keep 0.1.0 for the first release. Publish from master using local commands; npm publication is separate from GitHub Pages deployment.

Use `pnpm changeset` to record affected packages, `pnpm release:status` to review the version plan, and `pnpm release:version` to apply package versions, dependency ranges, changelogs, affected README version markers and the lockfile. Finish all edits before building and validating together. These commands do not commit, build or test automatically.

After committing validated changes and merging/synchronizing master, run `pnpm release:plan pdf` for a read-only preview, then explicitly run `pnpm release:publish pdf`. Multiple directory names or full @filumo/\* names are supported. Required missing dependencies are reported instead of silently added to the upload scope. For the first release use `release:plan --all`, followed by an explicitly approved `release:publish --all`; do not bump 0.1.0 just to initialize publishing.

`pnpm build pdf` prepares workspace prerequisites without requiring their publication. New Core API usage must declare the appropriate minimum dependency and Changeset. Release checks verify dist identities, public entries, packed dependency ranges and archive hashes; they do not prove that source is unchanged or tests passed.

Publishing uses the maintainer's npm credentials and the official registry. If a multi-package upload fails, inspect `tmp/release-*/result.json`, query the actual registry state through a new preview, then retry the same selection. Existing versions are skipped. No automatic unpublish, Git tag or push is performed.

Use Node 22.11 or a newer Node 22 release and the pinned pnpm 11.10.0. See CONTRIBUTING.md and .changeset/README.md for the full workflow. Changesets are release records to commit with code; local design and implementation-plan documents remain excluded.

## Visual acceptance

Check docs navigation, contents, reading width, tables, code, locale switches and anchors. Check Playground configuration/code synchronization, reset, copy, file selection and narrow layouts.

Component UI regressions should enable the default toolbar and cover image overlays, themes and real built framework consumers. Source-only style tests cannot prove version-scoped production CSS works.
