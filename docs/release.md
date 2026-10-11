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

The metadata check produces seven real tarballs, SHA-256 checksums and a report. It compares archive LICENSE/NOTICE bytes against the root files, checks public access/registry, real remote metadata, dependency protocols and exported files, and preserves the font's third-party notice. The consumer command verifies those archive hashes before installing them without workspace links. It checks strict public declarations, all seven Node imports without DOM globals, all 480 evaluated states and the packaged CLI. The shared loader also verifies complete set membership and refuses missing/duplicate packages, failed metadata gates and altered archive bytes. The same seven archive hashes now pass local Node 24/22, production Next/StrictMode, and three-engine browser preview/export consumers. The latter two reports preserve the complete archive set and its checksums. The API reference and quickstart snippets now execute and typecheck in the isolated seven-archive consumer. Remaining CI and release manifest gates prevent declaring the release ready.

## Publication prerequisites and recovery

The publication order is core → compiler/canvas → react/export → node → cli. npm publication is per package; the seven-package release is not atomic. For any future authorized publication, inspect each name/version already present in the registry before retrying a partial release. Verify an existing registry archive against its intended local artifact instead of attempting to overwrite it. npm does not reuse a published name/version combination after unpublishing. See [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

External gates remain pending: authenticated scope authority, repository visibility, package bootstrap and actual trusted-publisher settings. Public 404 responses do not prove scope ownership. Trusted-publisher configuration is documented against existing package settings; do not assume saving a publisher creates an unpublished package. First-publication authentication and permission checks must be resolved by the owner before publication. No bootstrap publication is authorized here.

According to [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), OIDC requires npm ≥11.5.1 and Node ≥22.14.0. The locally verified Node 22.12 consumer minimum is therefore insufficient for OIDC publishing. GitHub configuration must match the actual owner/repository and exact workflow filename, with `id-token: write`. Automatic provenance also requires a public repository and public package. Saving publisher settings does not verify them; the first successful publish validates the connection, and a new connection expires if unused for two days. Recheck those external settings at release time.

Acceptance/release workflows and the final release manifest/changelog/checklist are still being prepared. No workflow or registry success is claimed by this document.
