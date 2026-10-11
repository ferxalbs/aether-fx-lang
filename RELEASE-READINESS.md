# AETHER Fx v0 release readiness

Status: **IN PROGRESS — seven implementations, desktop browser export, React/Next and the reference audiovisual short verified; v0 not ready to publish.**

Reviewed 2026-10-10. The goal remains active. No public registry publication has occurred. The original goal document is preserved; concrete contracts are recorded in `GOAL.md`, `docs/architecture.md`, `docs/language-v0.md` and `docs/node-export.md`.

## Implemented and observed

- Seven ESM workspaces at 0.1.0: core, compiler, canvas, react, export, node and cli. Strict TypeScript, exact dependencies, lockfile, sourcemaps and declarations.
- Canonical document/plan validation, reference and topology checks; Chevrotain `.afx` parsing, contextual normalization, units and semantic pretty-printing.
- Direct frame evaluation, rational time, easing, rotation/holds, shot snapshots, persistent morphs, temporary drawings, actor/part parenting, camera/parallax and layers. Atomic revision-checked edits and locked-asset protection.
- Numeric Canvas renderer and verified real font/image/WAV loading. Gesture-triggered audio, pause/seek/rate/disposal, audio-clock-based playback and cancellation/error cleanup. Suspending the real AudioContext freezes the corresponding video clock.
- An original 12-part illustrated character, four poses, two eye drawings, three background layers, hand-parented lantern, declared font/image, and 20-second stereo WAV. Three shots contain exactly 144 + 192 + 144 frames. Intermediate reference images were inspected; contact positioning was corrected at the source.
- Explicit filesystem asset resolver, hash manifest, byte budgets, token-scoped loopback server with request allowlist, shared Chromium renderer, sequential FFmpeg export and CLI doctor/check/compile/render. Cancellation, timeout, failure cleanup, preserved existing output, repeated renderer disposal and isolated CLI consumers are exercised with real processes.
- 720p and 1080p VP9/Opus WebM exports: 480 decoded frames at 24 fps and exactly 960000 decoded 48 kHz audio samples. Three visual markers occur at their exact frame indices; audio onset differences from the source are -0.0833, -0.0208 and -0.0208 ms.

- React client FxPlayer with retained directive and external React peer. Isolated production Next server compilation, SSR/hydration, exact frame 97 pixels and ten App Router navigation cycles. Separate development StrictMode replay and fifty real font/image/WAV/audio cleanup cycles pass, including plan/resolver replacement, current callbacks, partial loading cancellation, integrity failure and ref disposal.

- Native WebCodecs browser export with owned real capability probes, Mediabunny progressive random-access muxing, one-frame video queue and audio queue capacity four. Chromium, Firefox and WebKit pass full 480-frame 720p preview/export and success/cancellation/write-failure lifetime checks; Chromium additionally passes 1080p and the actual demo download. Four real browser-package tarballs pass isolated imports/types/bundle checks.

## Executed checks

| Command | Result | Scope and limits |
| --- | --- | --- |
| `npm ci` | PASS, initial foundation | Clean local dependency reinstall; later Node dependency additions are in the lockfile |
| `npm run check` | PASS | Seven-package build, strict typecheck, 108 tests |
| `node scripts/verify-foundation.mjs` | PASS | Three foundation tarballs, isolated imports/types/browser bundle, all 480 Node/Chromium states, pixel/seek/DPR/50-cycle RAF disposal checks |
| `npm exec --yes --package=node@22.12.0 -- node node_modules/vitest/vitest.mjs run` | PASS | 108 tests on the declared Node floor |
| `node scripts/verify-resources.mjs` | PASS | Real image/font/WAV decoding, no AudioContext before gesture, pause/seek/rate, suspension, disposal, integrity failure and partial cancellation cleanup |
| `node scripts/inspect-short.mjs` | PASS | Eight illustrated references plus a six-frame earlier expression patch: six before/after real Chromium images, exact outside-interval pixels and intermediate changes confined to the mouth region |
| `node examples/node/export.mjs fixtures/short/little-light.afx artifacts/short/little-light-720.webm` | PASS | Real 480-frame 720p WebM; 15.103 s observed, export factor 0.755 |
| `node packages/cli/dist/afx.js render fixtures/short/little-light.afx --out artifacts/short/little-light-1080.webm --width 1920 --height 1080` | PASS | Real 480-frame 1080p WebM; 28.655 s observed, export factor 1.433 |
| `node scripts/verify-video.mjs` | PASS, with retained diagnostic | Actual metadata, full video/audio decode, exact visual pulses, source/decoded audio alignment and zero decoding errors at both resolutions |
| `node scripts/verify-node-lifecycle.mjs` | PASS | Pre-abort, timeout, cancellation after first frame, host callback failure, existing-output preservation, 12-frame real export and process cleanup observation |
| `node scripts/verify-node-packages.mjs` | PASS | Five real tarballs installed without symlinks; public declarations, all 480 isolated frame states, installed afx doctor/check/compile/render and paths containing spaces |
| `node scripts/verify-react-next.mjs` | PASS | Six real tarballs, Node import/SSR with guarded DOM globals, Next 16.4.0 default Turbopack production build/types, hydration, exact frame 97 pixels, actual audio rate/restart, ten navigation and fifty StrictMode real-resource/audio cleanup cycles |
| `npm exec --yes --package=node@22.12.0 -- node scripts/verify-react-next.mjs artifacts/next-packages-node22` | PASS | Same fifteen React/production Next/StrictMode checks on Node 22.12; report preserved separately |
| `npx -y react-doctor@0.9.17 packages/react --verbose --scope full --no-score --output-dir artifacts/react-doctor/package` | PASS | Full package scan, 1 source file, no diagnostics; score/network reporting disabled |
| `npx -y react-doctor@0.9.17 examples/next-app --verbose --scope full --no-score --output-dir artifacts/react-doctor/next` | PASS | Full example scan, 6 files, no diagnostics; score/network reporting disabled |
| `npx playwright install firefox webkit` | PASS | Actual Firefox 157.0 and WebKit 27.2 browser binaries installed; existing Chromium retained |
| `node scripts/verify-web-export.mjs` | PASS | Four isolated tarballs, all 480 shuffled numeric states in three engines, real preview/audio/seek, native VP9/Opus progressive exports, queue/resource audits, pre-abort/cancel/write-failure cleanup and demo download |
| `npm run verify:web` | PASS, browser milestone | Seven-package build/types/40 tests at that milestone, full isolated browser matrix and automatic decoding of all five successful outputs; exact frames/timestamps/flashes, audio sync, pre-skip/tail and zero decode errors |
| `node scripts/verify-foundation.mjs artifacts/corpus-packages` | PASS | Current core/compiler/canvas tarballs with source-location fixes and Apache metadata: isolated imports/types/browser bundle, all 480 frame states, pixels/seek/DPR/cleanup |
| `node scripts/verify-package-metadata.mjs`, earlier metadata milestone | PASS, historical | Seven real tarballs include identical Apache LICENSE and the previously supplied full NOTICE, actual remote/directory metadata, valid exports/protocols, SHA-256 sums, and unchanged Nunito license |
| `node scripts/verify-package-metadata.mjs`, current checkout | FAIL | NOTICE changed during the semantic audit to remove the Enosis Labs wording; the exact-owner assertion fails. Edits are preserved and attribution clarification is pending |
| `node scripts/verify-foundation.mjs artifacts/semantic-packages` | PASS | Current semantic-path fixes in three isolated tarballs; all 480 states, crossing contours under both fill rules, evenodd/nonzero interior pixels, animated layer occlusion under direct/reverse seeks, and lifecycle checks |
| `npm exec --yes --package=node@22.12.0 -- node scripts/verify-foundation.mjs artifacts/semantic-packages-node22` | PASS | Same eleven isolated foundation checks on Node 22.12; benchmark/memory and seven-package release remain separate |
| `git diff --check` | PASS | Whitespace check; untracked additions are also inspected directly |

Reference host: Node 24.21.0, npm 11.19.0, Playwright 1.64.0 / Chromium 156.0.8078.4, FFmpeg 8.0.1, macOS 15.7.7 x86_64. React/Next integration also passes on Node 22.12.0. These are local observations, not completed CI or platform-wide support claims. The prior three-package Node 22 tarball checks are preserved under `artifacts/foundation-node22`; those precede the latest audio-clock change.

Opus pre-skip is 312 samples; container duration is 20.008 s while actual video/audio content is 20 s. FFmpeg 8.0.1 prints an Opus parser message at the empty EOF flush. The debug log confirms all 1001 packets decode to 960000 samples with zero errors. `docs/node-export.md` records the source investigation and limits; `artifacts/short/video-report.json` retains stderr. No diagnostic is silently discarded.

Browser Opus files decode 960648 samples, including a measured 648-sample (13.5 ms) tail. OpusHead pre-skip is 312 even when ffprobe metadata reports initial padding zero. Video content remains 480 frames/20 seconds; container tails differ by engine. The Node reference exact-audio criterion is unchanged. See `docs/browser-export.md` and the complete decode report for the distinction.

Evidence: `artifacts/corpus-packages` contains the current three-package isolated checks after source fixes. `artifacts/metadata-packages` contains seven Apache-licensed tarballs, archive/metadata checks and checksums. `artifacts/short/patch-report.json` records the illustrated expression comparison. Historical milestone reports retain their executed scope; the latest Next six-package run passes after the source/license changes. `artifacts/foundation` contains three tarballs, checksums, report and curve pixel reference. `artifacts/node-packages` contains five milestone tarballs, checksums and the isolated consumer/export report. `artifacts/next-packages` contains six tarballs, checksums, production Next logs and the React/Next lifecycle report; Node 22 evidence is preserved under `artifacts/next-packages-node22`. `artifacts/short` contains the reference images, contact sheet, two full WebM files, audiovisual decode report, real resource report and Node lifecycle report. `artifacts/web-export` contains four real tarballs/checksums, three-browser preview images, full native exports, queue/lifetime report, browser dependency graph and audiovisual decode report. These are milestone artifacts, not final release packages; all original packages now carry owner-authorized Apache-2.0 LICENSE/NOTICE and observed repository metadata. npm scope ownership/publisher settings and final release gates remain unfinished.

## Mandatory v0 gates still open

| Gate | Status | Work remaining |
| --- | --- | --- |
| Complete parser/error corpus | PASS, local reference | All 18 declarations have valid roundtrip and invalid-property/truncation cases; EOF/unit/schema-field range fixes pass exact tests. Semantic paths distinguish collections/shots and repeated nested IDs; host manifests retain separate paths without invented source ranges |
| Complete geometry and patch corpus | PASS, local reference | Illustrated six-frame patch passes all-frame locality and real pixel checks; contour/segment order, closure and count mismatches reject remapping. Real Chromium crossing contours, both fill rules, holes and animated layer occlusion under direct/reverse seeks pass isolated tarball checks on Node 24 and 22 |
| Illustrated acceptance short | PASS, local reference | Required character/poses/drawings/backgrounds/contact/text/real assets and exact shot lengths present; desktop frame 97 images and all 480 numeric states checked in Chromium/Firefox/WebKit; complete geometry corpus remains separate |
| Audio/image/font lifecycle | PASS, local Chromium | Real resource/audio paths and fifty React StrictMode mount/play/dispose cycles pass; three-engine preview/audio/seek/asset disposal passes; exhaustive resource failure/StrictMode matrix was Chromium |
| React / Next production consumers | PASS, local Chromium | Six-tarball production Next 16.4.0 / React 19.3.0 SSR/hydration/navigation/direct seek, plus separate development StrictMode proof |
| Node export / CLI | PASS, local reference | Real exports, cancellation/timeout/cleanup/doctor and isolated packaged consumers pass; cross-platform CI remains pending |
| Browser export | PASS, local desktop | Real native VP9/Opus configuration probes and full progressive exports in Chromium/Firefox/WebKit; queue/resource cleanup and Node unsupported/no-output diagnostics |
| 720p/1080p WebM and synchronization | PASS, local reference | VP9/Opus, 480 decoded frames, 20-second content and audio alignment within one frame |
| Firefox/WebKit / mobile | PARTIAL | Desktop Chromium/Firefox/WebKit preview and native export pass; physical mobile remains provisional |
| Performance / memory | PARTIAL | Export times observed; complete frame/seek/compile p50/p95, visible preview and 20s/60s full pipeline bounded-memory measurements remain pending |
| Seven-package distribution | PARTIAL | Six-package Next and four-package browser milestone consumers pass; seven licensed archives/metadata passed before the concurrent NOTICE edit. Current exact-notice check fails pending attribution clarification. Scope config and final seven-package consumers remain |
| CI / release preparation | NOT RUN | Full acceptance workflows, pinned tools, release manifest/changelog/checklist and verified publish order |
| Publication identity | PENDING OWNER / EXTERNAL | Apache-2.0 and actual Git remote confirmed. Concurrent edits shortened NOTICE to Copyright 2026  Fer's; intended final attribution needs clarification before rebuilding release archives. @aether-fx package names returned 404, which does not prove scope availability/ownership; npm whoami returned ENEEDAUTH. Scope control and trusted publisher remain unverified |

`ExportReport.peakRssBytes` measures only the Node coordinator; it excludes Chromium and FFmpeg and does not prove the memory gate. Physical audiovisual output latency, optional MP4 acceptance, physical mobile and final distribution are unverified. External publication prerequisites do not block the independent implementation work. Open mandatory gates prevent declaring v0 complete.

## Next execution sequence

1. Measure visible performance and 20s/60s full pipeline memory; keep physical mobile provisional.
2. Resolve the concurrent NOTICE edit against the owner's intended attribution, then prepare and verify all seven final tarballs and CI/release artifacts.
3. Preserve external publication prerequisites without publishing.
