# Release preparation

Release preparation is in progress. Nothing has been published, and these commands do not publish. Original code uses Apache-2.0 with the owner-confirmed `Copyright 2026  Fer's` notice. Repository metadata comes from the actual origin remote, https://github.com/ferxalbs/aether-fx-lang.git. See [licensing and identity](licensing.md) and [current gates](../RELEASE-READINESS.md).

## Scope and joint version

`release.config.json` is the single configuration for npm scope and the joint package version. Its initial values are `@aether-fx` and `0.1.0`. The package version is separate from the document schema version. Choosing a scope here does not establish npm ownership or reserve package names.

After changing the configuration, run from the repository root:

```sh
npm run release:sync
npm ci
npm run check
node scripts/prepare-next-example.mjs
npm --prefix examples/next-app run typecheck
```

Synchronization updates the seven package names, internal dependency versions, source imports, verification scripts, package README/API examples, private Next manifest, and root/Next lockfile entries. It reads all candidates before writing changes. It excludes generated builds, installed dependencies, historical goal/readiness records and artifact directories. Root and Next example remain private. It preserves external dependency versions, repository attribution and third-party notices.

A changed package identity invalidates the private Next example's local tarball integrity entries. The synchronization command removes those obsolete internal hashes; `prepare-next-example.mjs` rebuilds the archive installation from the current package builds and records new npm integrity hashes. Run preparation before installing the Next example from its lockfile. Existing artifact directories retain their historical identities; rebuilding produces archives for the selected scope/version. Review bundle sizes again if changed embedded package names affect the measured baseline.

`npm run release:check` rejects unsynchronized files. The build separately checks every public manifest against the configuration. Synchronization is idempotent. The intended release scope remains `@aether-fx`; it has not been changed in the working checkout.

```sh
node scripts/verify-release-config.mjs
```

This verification uses an isolated temporary copy, selects an unpublished test scope and version, checks invalid configuration and drift rejection, synchronizes all references, installs with clean `npm ci`, builds/types/tests all packages, packs and installs all seven archives in another isolated consumer, and executes the installed CLI's full 480-frame VP9/Opus export. It also rebuilds the Next example's archive installation, checks its types and synchronizes back to the original configuration. Temporary copies are removed. Evidence: `artifacts/release-config/report.json`. This check does not establish registry permissions or replace browser/Next production lifecycle gates.

## Archive checks and installation

```sh
npm run check
node scripts/verify-package-metadata.mjs
node scripts/verify-node-packages.mjs artifacts/metadata-packages
node scripts/verify-react-next.mjs artifacts/seven-package-next artifacts/metadata-packages
node scripts/verify-web-export.mjs artifacts/metadata-packages artifacts/seven-package-web
npm exec --yes --package=node@22.12.0 -- node scripts/verify-node-packages.mjs artifacts/metadata-packages artifacts/seven-package-consumer-node22
```

The metadata check produces seven real tarballs, SHA-256 checksums and a report. It compares archive LICENSE/NOTICE bytes against the root files, checks public access/registry, real remote metadata, dependency protocols and exported files, and preserves the font's third-party notice. The consumer command verifies those archive hashes before installing them without workspace links. It checks strict public declarations, all seven Node imports without DOM globals, all 480 evaluated states and the packaged CLI. The shared loader also verifies complete set membership and refuses missing/duplicate packages, failed metadata gates and altered archive bytes. The same seven archive hashes now pass local Node 24/22, production Next/StrictMode, and three-engine browser preview/export consumers. The latter two reports preserve the complete archive set and its checksums. The API reference and quickstart snippets now execute and typecheck in the isolated seven-archive consumer. The bundle is now prepared; full acceptance preview stability, hosted CI and external publication gates prevent declaring the release ready.

## Publication prerequisites and recovery

The publication order is core → compiler/canvas → react/export → node → cli. npm publication is per package; the seven-package release is not atomic. For any future authorized publication, inspect each name/version already present in the registry before retrying a partial release. Verify an existing registry archive against its intended local artifact instead of attempting to overwrite it. npm does not reuse a published name/version combination after unpublishing. See [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

External gates remain pending: authenticated scope authority, package bootstrap and actual trusted-publisher settings. The canonical GitHub repository was observed public. Public 404 responses do not prove scope ownership. Trusted-publisher configuration is documented against existing package settings; do not assume saving a publisher creates an unpublished package. First-publication authentication and permission checks must be resolved by the owner before publication. No bootstrap publication is authorized here.

According to [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), OIDC requires npm ≥11.5.1 and Node ≥22.14.0. The locally verified Node 22.12 consumer minimum is therefore insufficient for OIDC publishing. GitHub configuration must match the actual owner/repository and exact workflow filename, with `id-token: write`. Automatic provenance also requires a public repository and public package. Saving publisher settings does not verify them; the first successful publish validates the connection, and a new connection expires if unused for two days. Recheck those external settings at release time.

The prepared workflows and local release bundle are described below. Hosted workflow execution and registry publication are not claimed.

## Prepared acceptance and release workflows

`.github/workflows/ci.yml` runs on pull requests, main pushes, manual dispatch and reusable calls. It uses Ubuntu 24.04, exact Node 24.21.0/22.12.0 and npm 11.19.0, a clean `npm ci`, the lockfile's Playwright browser installation, and FFmpeg 8.0.1 built from its checksum-pinned official source with libvpx/libopus/zlib. Ubuntu codec development packages remain distribution dependencies; the FFmpeg source/version/configuration is fixed. Build failures or missing encoders fail acceptance. Action references are pinned to verified upstream commit SHAs, and package caching is disabled.

`npm run lint` checks JavaScript/TypeScript syntax and JSON validity with the existing Node/esbuild toolchain; strict semantic typechecking is separate. `npm run verify:ci` runs the existing gates sequentially, records each command's exit/result/time and stops at the first failure. It includes build/types/108 tests, budgets, geometric pixels, the illustrated patch/resources, Node cancellation/cleanup, metadata, the same seven-archive Node/Next/browser consumers, scope migration and all three preview/export-memory benchmarks. The headed benchmark uses Xvfb on Linux. Linux process-name/hardware collection is supported by the benchmark scripts; physical display latency is still unmeasured.

`.github/workflows/release.yml` is manual only and calls the same acceptance workflow. Its `publish` input defaults to false. The publishing job requires both an explicit true input and a verified `publicationReady` manifest; the current generator always records false because publication is not authorized. It declares `id-token: write`, the optional `npm-publication` environment and explicit per-archive npm publish commands. No workflow has been dispatched by this goal. Configure the actual trusted publisher for owner `ferxalbs`, repository `aether-fx-lang`, workflow filename `release.yml` only after separate owner authorization and the external bootstrap/settings checks. A failed package stops the loop; inspect registry versions/integrity before any future resumption.

The workflows pass Actionlint 1.7.12 locally; Bash setup syntax is checked separately. This does not prove a hosted Ubuntu execution. The canonical GitHub repository was observed public with current-account repository access. npm now authenticates as `ferxalb`; `npm org ls aether-fx --json` returned E404. This does not establish scope availability/ownership, and no organization or publisher settings were changed.

## Assemble the reviewable bundle

```sh
node scripts/prepare-release.mjs
```

This copies the verified seven tarballs, Apache LICENSE/NOTICE, changelog and documentation into `artifacts/release`, alongside archive SHA256SUMS, `manifest.json`, copied evidence reports and `CHECKLIST.md`. The manifest records exact tool versions, canonical remote, dependency publication order, archive/report hashes and PASS/FAIL/BLOCKED gates. It compares consumer archive hashes to the selected metadata set. It records both the Git commit and a SHA-256 of sorted tracked/unignored source paths, mode categories and content hashes. When dirty, the commit is a base reference and the tree hash identifies the actual source; regenerate the bundle after any source/documentation change.

The local acceptance run and hosted CI remain distinct checklist rows. External npm authority/bootstrap gates remain blocked. Preparation is usable while external gates remain unresolved; it does not mark the artifacts publication-ready. [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Playwright CI](https://playwright.dev/docs/ci-intro) and [official FFmpeg source](https://ffmpeg.org/download.html) describe the tooling used here.

Current local closure: `npm run verify:ci` finished with fourteen PASS commands and one preview timeout. The earlier three-drop failure is also retained. Only the preview was then reproduced with diagnostic audio/timeout capture; it passed the same three-play/zero-drop gate. The root cause remains unresolved. `prepare-release.mjs` preserves both failure incidents and the isolated diagnosis; the full acceptance matrix remains FAIL and `publicationReady` remains false.
