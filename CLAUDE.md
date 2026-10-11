# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development commands

Run commands from the repository root. Use Node >=22.12.0; the documented reference environment is Node 24.21.0 with npm 11.19.0. This is a private npm-workspace root with ESM-only packages.

```sh
npm ci
npm run build       # Build all seven packages and emit declarations
npm run typecheck   # Semantic TypeScript checks
npm run lint        # JS/TS syntax and JSON checks, not ESLint
npm test            # Vitest, one run
npm run check       # release:check, build, typecheck, then tests (does not include lint)
```

Tests import package exports from built `dist` outputs. Build before running tests directly, and rebuild after changing package source:

```sh
npm run build
npm test -- tests/core.test.ts
npm test -- tests/core.test.ts -t "evaluates all 480 frames identically in shuffled, reverse and linear order"
```

There is no root `dev` command. For the browser demo:

```sh
npm run build
node examples/browser/serve.mjs  # http://127.0.0.1:3000; PORT overrides the port
```

The Next example is outside the root workspaces. Preparation installs current local tarballs and copies fixture assets; run it before installing/building the example:

```sh
npm run build
node scripts/prepare-next-example.mjs
npm --prefix examples/next-app run dev
# Production: npm --prefix examples/next-app run build && npm --prefix examples/next-app start
```

### Acceptance checks

Compilation and unit tests do not require Chromium or FFmpeg. Node rendering requires Playwright Chromium and an external FFmpeg installation with `libvpx-vp9` and `libopus`. Full browser acceptance needs all three Playwright engines:

```sh
npx --no-install playwright install --with-deps chromium firefox webkit
node packages/cli/dist/afx.js doctor
npm run verify:ci
# Linux CI runs: xvfb-run -a npm run verify:ci
```

`verify:ci` runs lint/check followed by sequential, fail-fast rendering, resource, package-consumer, release-migration, memory, and preview gates. It writes `artifacts/ci/acceptance-report.json`; gates after a failure are not executed. Targeted commands are `npm run verify:foundation`, `npm run verify:node`, `npm run verify:react`, and `npm run verify:web` (each starts with `check`). `npm run verify:resources` does not build/check first.

## Architecture and contracts

AETHER Fx is an experimental declarative 2D animation language and universal TypeScript runtime. `GOAL.md` is the active acceptance specification. The main data flow is:

`.afx source → compiler AST → normalized FxDocument → core compile → immutable PlaybackPlan → evaluate({ frame }) → owned DrawList → Canvas renderer`

The seven packages split platform-independent semantics from adapters:

- **`core`** owns canonical types/JSON schema, validation, plan compilation, deterministic absolute-frame evaluation, geometry/time helpers, serialization, and atomic patches. It must not import DOM, filesystem, networking, or the parser.
- **`compiler`** uses Chevrotain for syntax, then normalizes declarations, defaults and units into canonical documents. `compileSource` delegates compilation to core. The language is data, not JavaScript expressions or executable scripts.
- **`canvas`** renders numeric DrawLists and provides browser resources, player, and audio lifecycle. Assets resolve through an explicit host adapter, not implicit network access.
- **`react`** is a thin client wrapper around Canvas sessions. Create one player/resource session per plan/resolver identity in an effect; playback stays outside React state. Only serializable plans cross the server/client boundary.
- **`export`** reuses evaluation/rendering for native WebCodecs VP9/Opus and Mediabunny WebM muxing, with bounded queues and a host-provided random-access sink. Probe actual codec configurations; return `EXPORT_UNSUPPORTED` rather than adding a MediaRecorder fallback.
- **`node`** loads local projects/assets and renders through isolated Playwright Chromium, streaming frames to external FFmpeg. Deny external requests, allowlist local resources, and pass FFmpeg separate arguments, including paths with spaces.
- **`cli`** exposes Node diagnosis/loading/export and core plan serialization as `afx doctor`, `check`, `compile`, and `render`. Compile/render output paths must be new; existing files are rejected.

Preserve these cross-package invariants:

- `Result<T>` stays `{ ok: true, value } | { ok: false, diagnostics }`. Document and plan `schemaVersion` are independently `1`, separate from npm versions. External JSON validation never coerces values or inserts defaults; defaults belong in DSL normalization.
- Source ranges are zero-based, half-open UTF-16 offsets, with one-based line/column. Canonical diagnostics retain JSON paths and declaration/shot ownership; host manifest failures must not acquire invented source ranges.
- Authored frames are shot-local nonnegative integers; shots concatenate in declaration order, while evaluation is absolute and independent of seek order. Canonical angles are radians. Time/sample conversion rounds absolute rational indices with BigInt intermediates, nearest with ties up.
- Morph correspondence uses identical contour/segment IDs, order, counts and closure, not geometric proximity. Morph/exposure intervals are half-open: morph destinations persist, temporary exposures expire. Actor/part state carries across shot boundaries; camera framing resets.
- Plans are copied and recursively frozen; DrawLists own their arrays/geometry. Imported plans are recompiled and checked. Patches clone, validate and compile before returning a new revision; failures never mutate caller documents. Locked assets require explicit host authorization.
- Browser package imports must work without DOM/audio globals at module initialization. Distinguish caller-owned resources from session-owned resources, and preserve cleanup on cancellation, failure, repeated disposal, StrictMode replay and navigation.

For detailed contracts, use `docs/architecture.md` and `docs/language-v0.md`; public API and consumer guidance are in `docs/api.md` and `docs/quickstart.md`. Platform ownership/export contracts are in `docs/react-next.md`, `docs/node-export.md`, and `docs/browser-export.md`. `fixtures/curve.afx` is semantic regression evidence, not visual acceptance; illustrated media acceptance uses `fixtures/short/` and actual rendered/decoded outputs.

## Build and release boundaries

- Preserve the exact dependency pins, Apache-2.0 metadata, LICENSE/NOTICE, and third-party notices. Existing `.coderabbit.yaml` reinforces the contracts above; do not introduce a new style linter solely for review preferences. Keep GitHub Actions SHA-pinned with version comments, read-only contents permissions, and the Node 24.21/22.12 acceptance matrix.
- `scripts/build.mjs` builds packages in dependency order, externalizes package imports, emits ESM plus declarations, copies LICENSE/NOTICE, and adds the core JSON schema. It also builds the Node browser renderer and CLI executable. React's built entry preserves `'use client'`.
- `release.config.json` is the source of truth for the joint npm scope/version. After changing it, run `npm run release:sync`, then `npm ci` and rebuild/reprepare the Next example; `npm run release:check` and the build reject inconsistent package manifests or internal dependency versions.
- Browser bundle checks (`scripts/verify-bundle-budgets.mjs`, `bundle-budgets.json`) prohibit Node/Playwright tooling in browser bundles and compiler/parser dependencies in the core/player bundles.
- Package-consumer verification installs all seven real, hash-verified archives into isolated consumers. Workspace success or `npm link` is not release evidence. `node scripts/verify-package-metadata.mjs` produces archives under `artifacts/metadata-packages`.
- `node scripts/prepare-release.mjs` prepares release artifacts, not publication. Public npm publication requires a separate explicit instruction; consult `docs/release.md` and `RELEASE-READINESS.md` before release work.
- Read `RELEASE-READINESS.md` and `KNOW-ISSUES.md` for current evidence and blockers. Local acceptance does not imply hosted acceptance. Preserve failed-run diagnostics and do not relax exact pixel, decoded media, preview-drop, or bundle-budget gates to claim success.
