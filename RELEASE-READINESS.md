# AETHER Fx v0 release readiness

Status: **IN PROGRESS — foundation implemented and verified; v0 not ready to publish.**

Reviewed 2026-10-10. The goal remains active. No public registry publication has occurred. The original goal document is preserved; concrete contracts are recorded in `GOAL.md`, `docs/architecture.md` and `docs/language-v0.md`.

## Implemented foundation

- Three ESM workspaces at 0.1.0: core, compiler, canvas. Strict TypeScript, exact dependencies, lockfile, JS sourcemaps and declarations.
- Canonical document/plan JSON schema, diagnostics, safe structural validation, explicit manifest/reference validation, cubic topology correspondence and hierarchy checks.
- `.afx` lexer/parser, contextual normalization, finite numbers and f/deg/rad units, semantic pretty-printer and compile-source convenience API.
- Absolute frame evaluation, rational timestamps/sample indices, linear/cubic-bezier easing, direct/shortest rotation, independent track holds, shot snapshots, persistent morphs, temporary exposures, parenting, parallax and stable layer ordering.
- Atomic addNode/updateProperty/removeNode/insertKey edits, revision conflicts and locked-asset protection.
- Numeric Canvas 2D renderer, explicit SHA-256 checked resource loading, imperative player with seek/rate/DPR/audio lifecycle and disposal. Audio/image/font integration code exists but those resource paths have not yet received the mandatory end-to-end acceptance tests.

## Executed checks

| Command | Result | Scope and limits |
| --- | --- | --- |
| `npm ci` | PASS | Clean local dependency reinstall; 0 reported vulnerabilities |
| `npm run verify:foundation` | PASS | Build, strict typecheck, 35 tests, three packed-package isolated consumer and Chromium checks |
| `npm exec --yes --package=node@22.12.0 -- node node_modules/vitest/vitest.mjs run` | PASS | Same 35 tests on the declared Node floor |
| `npm exec --yes --package=node@22.12.0 -- node scripts/verify-foundation.mjs artifacts/foundation-node22` | PASS | Three isolated tarballs, types, browser bundling and Chromium rendering on Node 22.12 |
| `npm audit --omit=dev --audit-level=moderate` | PASS | 0 reported vulnerabilities; does not substitute for code/security review |
| `git diff --check` | PASS | Existing tracked diff; repository still has no commits and new files are untracked |

Reference: Node 24.21.0, npm 11.19.0, Chromium 156.0.8078.4 / Playwright 1.64.0, macOS 15.7.7 x86_64. FFmpeg installed locally includes libvpx-vp9 and libopus; no video export acceptance claim yet.

The suite queries all 480 curve-fixture frames in shuffled/reverse order, checks shot boundaries, explicit direct seek, morph persistence, exposure reversion, topology failures, parenting cycles, rational 30000/1001 timestamps, plan corruption, atomic six-frame edits and asset locks. The isolated consumer installs real `.tgz` files together without symlinks or source aliases, imports them in Node, typechecks declarations and bundles them for the browser. Chromium's all-480-frame semantic results exactly match Node. Pixel checks cover a cubic curve, evenodd hole and front layer overlap. Fifty play/dispose cycles leave zero scheduled/called animation callbacks.

Evidence lives in `artifacts/foundation/report.json`, `SHA256SUMS`, three `.tgz` files and `curve-frame-97.png`; the Node 22 evidence is in `artifacts/foundation-node22`. These are milestone artifacts, not final release tarballs. Tarballs currently lack finalized LICENSE, repository/homepage/bugs metadata and the other four required packages.

## Mandatory v0 gates still open

| Gate | Status | Work remaining |
| --- | --- | --- |
| Complete parser/error corpus | PARTIAL | Valid/invalid fixtures for every construction and precise schema-field source ranges |
| Complete geometry and patch corpus | PARTIAL | Illustrated geometry, visual intermediate poses, holes/crossings/occlusion regressions and resource edits |
| Illustrated acceptance short | NOT RUN | Own licensed 8–15-part character, four poses, two eye drawings, three background layers, object/hand contact, text and WAV signals; exactly 144+192+144 frames |
| Audio/image/font lifecycle | NOT RUN | Real resources, gestures, seek/pause/rate synchronization, integrity/cancellation and repeated cleanup |
| React / Next production consumers | NOT RUN | Implement React package and example; packaged SSR, hydration, StrictMode, navigation and seek |
| Node export / CLI | NOT RUN | Implement resolver, allowlisted server, Chromium frame export, FFmpeg backpressure/cancel/timeout/doctor and CLI |
| Browser export | NOT RUN | Implement actual WebCodecs/Mediabunny capability queries, audio, progressive sink/cancel and unsupported diagnostics |
| 720p/1080p WebM and synchronization | NOT RUN | Export and decode 480 frames; VP9/Opus, 20s duration, audio and marker error <= one frame |
| Firefox/WebKit / mobile | NOT RUN | Preview matrix; physical mobile remains provisional |
| Performance / memory | NOT RUN | Real short compile/seek/frame p50/p95, visible preview, hardware report and 20s/60s bounded-memory measurements |
| Seven-package distribution | PARTIAL | Three foundation packages pass; complete all manifests, licencing, scope config and seven consumers |
| CI / release preparation | NOT RUN | Full acceptance workflows, pinned tools, release manifest/changelog/checklist, verified publish order; no automatic public publication |
| Publication identity | BLOCKED EXTERNAL | Confirm license/owner, Git remote/repository URLs, npm scope control and real trusted-publisher settings |

External publication prerequisites do not block implementation or local packaging. Mandatory functional gates remain open and prevent declaring v0 complete. No benchmark, export, mobile, React/Next or full-release gate is inferred from the passing foundation tests.

## Next execution sequence

1. Complete the illustrated source/asset fixture and verify real resource/player audio paths against the same core contracts.
2. Add React and isolated Next production integration, then Node resolver/export/CLI and browser export.
3. Execute visual/audiovisual/preview/memory/performance gates, fix failures, and build all seven tarballs with final manifests.
4. Verify complete isolated consumers and CI/release artifacts; preserve externally pending publication setup without publishing.
