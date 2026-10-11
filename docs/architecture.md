# AETHER Fx v0 architecture

This is a maintainer reference for package boundaries and implementation contracts. For usage, start with the [quickstart](quickstart.md).

The investigation and milestones below were recorded on 2026-10-10. Their pending gates and test counts describe those earlier stages. For the latest recorded status, use [release readiness](../RELEASE-READINESS.md) and [known issues](../KNOW-ISSUES.md): hosted acceptance has run and failed in Next playback.

## Repository baseline

The repository started with a package manifest, lockfile and TypeScript installation. There were no implementation files, tests, Git commits or Git remote. The baseline manifest declared ISC. The owner subsequently authorized Apache-2.0 and supplied the copyright notice; LICENSE, NOTICE and docs/licensing.md record that decision.

## Verified local tools

| Tool | Observed value | Evidence |
| --- | --- | --- |
| Node | 24.21.0 | `node --version` |
| npm | 11.19.0 | `npm --version` |
| OS | macOS 15.7.7, Darwin x86_64 | `sw_vers`, `uname -sm` |
| TypeScript | 7.0.2 | existing installation, npm metadata |
| Chevrotain | 13.2.0; Node >=22 | npm metadata; official lexer/parser docs |
| Vitest | 5.0.3; Node ^22.12 or ^24 or >=26 | npm metadata |
| esbuild | 0.28.2; Node >=18 | npm metadata |
| Playwright | 1.64.0; Node >=20 | npm metadata |
| Mediabunny | 1.61.3 pinned | Native browser exports and independently decoded WebM files |
| Next/React | Next 16.4.0 / React 19.3.0 pinned | Isolated production Next and development StrictMode checks |
| FFmpeg | libvpx-vp9 and libopus available | `ffmpeg -hide_banner -encoders` |

Pin dependencies exactly and use the lockfile. The initial engine floor is Node >=22.12.0 because of the development toolchain; the foundation tests and isolated consumers have now also passed locally on Node 22.12.0. Full-product Node 22 CI remains an open gate before claiming complete v0 support. Available versions do not establish integration compatibility.

## Contracts resolved by this implementation

- Authoring source uses named declarations and typed property data. Chevrotain parses syntax; normalization rejects unknown declarations/properties and resolves units. No JavaScript expression grammar or execution exists.
- `Result<T>` is `{ ok: true, value } | { ok: false, diagnostics }`. Source failures carry zero-based, half-open UTF-16 offsets plus one-based line/column. Canonical JSON failures carry JSON paths; compile-source maps schema paths to the originating values and attaches affected declaration ranges for semantic failures. EOF uses the actual source end and numeric ranges include units.
- Canonical documents and plans use independent `schemaVersion: 1`. The exported JSON Schema is draft 2020-12. Validation never coerces types or inserts defaults into externally supplied JSON. DSL normalization inserts documented defaults.
- The schema evaluator supports exactly the JSON Schema constructs used by the exported schema. It is not a general-purpose schema library. Structural validation rejects nonfinite numbers, unknown properties, unsafe keys, cycles, nonplain objects and oversized nesting. The core contains no DOM, filesystem, networking or parser import.
- IDs are stable within their collection. Actor targets are `actor` and `actor.part`; `camera` is reserved. Contour IDs are local to a shape and segment IDs are local to a contour. Correspondence requires identical IDs, order, contour closure and segment counts, never geometric proximity.
- Every part has one content type: cubic shape, image or text. Geometry definitions and actor instances remain separate. Part parenting is static; actor parenting may switch at a discrete key to an `actor.part` anchor.
- All authored frame coordinates are shot-local, integer and nonnegative. Shots concatenate in declaration order. Source units are `f`, `deg`, `rad`; canonical angles are radians. Timestamps and sample indices round each absolute rational index to nearest integer with ties up using BigInt intermediates.
- Part/actor defaults are defined initial values. A property holds its initial value before its first key; its last key persists. Numeric tracks interpolate; evaluated opacity clamps to [0,1] even when easing overshoots. Strings, booleans and null switch at the key boundary. A left key controls interpolation easing, rotation mode and sampling hold until the next key.
- Morph intervals are `[start,end)` with a destination state held from `end`. Explicit source/destination pose properties are required on both sides. Sequential morphs are ordered by start time; overlapping writers are errors. Discrete exposure overrides are temporary and return to the underlying drawing at `end`.
- Each shot receives a boundary snapshot of the preceding shot at local time `duration`, then applies explicit initial values. A morph ending exactly on that boundary reaches its destination. Camera framing is explicitly reset from each shot's camera declaration/default, while actor and part states carry forward.
- Composition is part local transform and pivot, ancestor parts, actor instance and anchor parent, inverse camera, then stable layer ordering. Camera scales must be positive and their easing cannot overshoot. Parallax scales camera translation per background actor.
- Plans are copied and recursively frozen. DrawLists own their arrays and geometry; consumers may retain them across asynchronous operations. There is no scratch lifetime hazard in this first implementation.
- Imported plans are structurally checked and recompiled from their documents and manifests. Supplied snapshots, durations or shot indices must equal the rebuilt plan. Key order in JSON objects is immaterial.
- Patches clone the document, apply all operations, validate and compile the candidate, then return a new revision. Failed operations never mutate the caller's document. Locked assets require an explicit host authorization option. Dependency reporting is conservative; recompilation is complete in v0.

## Review findings and remaining investigation

The initial compatibility matrices and performance targets were proposals, not measured results. The earlier research file, npm scope ownership, actual trusted publisher settings and physical mobile testing remain unknown. The owner has supplied copyright/license metadata, and the actual Git remote is now recorded in docs/licensing.md. These do not prevent local implementation, but public release cannot claim them as verified.

The player, resource resolver, browser export and Node export must test cancellation/cleanup as runtime behaviors. A schema validator cannot isolate Chromium. Node reference export must deny external requests, serve an allowlisted local resource set and invoke FFmpeg with separate arguments. Web export must query actual VP9/Opus configurations and return `EXPORT_UNSUPPORTED` when missing; no recording fallback.

The 480-frame curve fixture is a deterministic semantic regression fixture. It is not the required illustrated short and cannot count as visual, audiovisual, memory or performance acceptance evidence. Full end-to-end evidence must come from actual rendered images, a decoded video, audio markers and isolated tarball consumers.

## Primary references consulted

- [Chevrotain lexer tutorial](https://chevrotain.io/docs/tutorial/step1_lexing.html) and [parser tutorial](https://chevrotain.io/docs/tutorial/step2_parsing.html): runtime grammar and JavaScript parser architecture.
- [Next.js server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components): library entry points must preserve `use client`; server-to-client data must be serializable.
- [Playwright Library](https://playwright.dev/docs/library): browser launch, contexts and explicit browser installation/cleanup.
- [Mediabunny formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs): container support differs from actual device encodability; query real configurations.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/): npm >=11.5.1 and Node >=22.14.0; configuration belongs to an existing package's settings. Release workflow tools must satisfy this floor separately from runtime engines.
- [Canvas cubic curves](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/bezierCurveTo) and [FontFace construction](https://developer.mozilla.org/en-US/docs/Web/API/FontFace/FontFace): numeric rendering and explicit font preparation.

## React/Next integration verified (2026-10-10)

React 19.3.0 and Next 16.4.0 are pinned. FxPlayer owns one player/resources session per plan/resolver identity, creates it in an effect, and retains its client directive in the built package. Current callback delivery uses useEffectEvent; controls delegate through a stable imperative ref. The existing Canvas/audio code handles frames outside React state.

A six-tarball isolated consumer passes plain Node import/SSR, default Turbopack production Next build, server compilation, hydration, exact frame 97 pixels against offline Chromium, gesture controls and ten App Router navigation cleanup cycles. A separate development StrictMode harness proves effect replay and fifty real font/image/WAV/audio cleanup cycles plus replacement/cancellation/error paths. See docs/react-next.md for scope, commands and evidence. These tests do not prove the cross-browser or full pipeline memory gates.

## Browser export verified (2026-10-10)

The seventh implementation uses owned native WebCodecs configuration probes and encoders, with Mediabunny encoded-packet sources for WebM muxing. Explicit queue checks and sequential video flushes enforce bounds rather than relying on a single dequeue notification. Encoder and muxer failures are latched across asynchronous operations; cancellation closes native encoders and aborts the host's cooperative random-access sink. No alternate recorder implementation is retained.

Four real tarballs pass isolated Node import, public types and browser graph checks. Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2 pass desktop preview and complete 480-frame 720p exports; Chromium also passes 1080p and the demo download. Native lifetime counters are zero after success and failure. The independent decoder distinguishes 20-second source content from Opus pre-skip and the measured 13.5 ms browser audio tail. See docs/browser-export.md and artifacts/web-export for exact capabilities, codec/container metadata and limits. Full pipeline memory, physical mobile, full semantic corpus, final seven-package consumers and CI remain separate gates.

The subsequent semantic audit fixes declaration ownership using canonical paths, preserving collection-local IDs and per-shot track IDs. Validation constructs its ownership index only on failure; valid compilation keeps its existing evaluation path. Compilation errors for missing initial values, parenting and camera scale also retain their shot/key paths. Host manifest paths are explicitly separated from DSL source ranges. All 108 tests pass on Node 24.21 and Node 22.12. Current three-package isolated consumers in artifacts/semantic-packages and artifacts/semantic-packages-node22 additionally pass real Chromium self-crossing contour, evenodd/nonzero interior and animated occlusion pixels under direct/reverse seek. These close the local parser/geometry regression gates; full pipeline memory/performance, final seven-package distribution and CI remain open. At that milestone, concurrent NOTICE edits were preserved and the exact-notice archive check failed pending owner clarification; the confirmation and rebuilt archive result are recorded below.

The reference benchmark gate now passes locally. Visible Chromium at 720p/DPR1 measures complete playing-frame callback p95 1.90 ms and zero drops over three 20s plays; compile, loaded first frame, direct seek and in-play RAF cadence are measured separately. Full-process Node and native-browser exports are sampled at 20s/60s with exact repeated states and PCM. Both decode all 480/1440 frames; Node audio is exact length while native audio retains its documented 648-sample tail. Aggregate RSS grows about 4.72%/3.97% for three times the frames, with known frame/encoder/sink bounds and no owned export processes remaining. Native audit sets delete closed objects. Standalone gzip baselines are observed twice, reviewed with dependency graphs and recorded as exact caps through a shared helper. See docs/performance.md and artifacts/performance for raw data, timings, process roles, assets, codec stderr and limits. This supplies local reference evidence, not unique physical memory, universal performance, physical mobile or completed CI/release claims.

The owner subsequently confirmed the current `Copyright 2026  Fer's` notice. All seven packages were rebuilt from the root Apache-2.0 LICENSE/NOTICE, and real archive metadata checks pass with the actual Git remote and unchanged Nunito OFL. The existing isolated Node consumer now installs all seven exact SHA-256-verified metadata archives, checks public declarations with `skipLibCheck: false`, imports every package without DOM globals, compares all 480 evaluated frames and runs the packaged CLI doctor/check/compile/render against a path containing spaces. The full VP9/Opus result has 480 decoded video frames. All nine checks pass on Node 24.21 and Node 22.12 against the same archive hashes, with separate reports. Final same-set browser/Next consumers, configurable scope and CI/release preparation remain open.

Release identity now comes from release.config.json. The synchronization command updates package names, imports, joint internal versions and lockfile entries; builds reject manifest drift. An isolated scope/version migration passes invalid-input/drift checks, clean npm ci, all seven builds, strict types and 108 tests, seven packed consumers with installed CLI export, and refreshed Next archive installation/types. It then synchronizes back idempotently. Original @aether-fx/0.1.0 checkout remains unchanged in identity. Old Next tarball integrity is removed only when identity changes and recomputed by example preparation; external versions and notices remain intact. See docs/release.md and artifacts/release-config/report.json.

Shared release distribution now passes locally using one complete seven-archive set. A reused loader checks successful metadata gates, unique membership, versioned archive filenames and SHA-256 before installation in Node, Next and browser consumers. Missing or duplicate packages, failed metadata gates and tampered bytes are rejected. The production Next consumer passes 17 SSR, type, hydration, pixel, audio, navigation and StrictMode checks with fifty real cleanup cycles. Chromium, Firefox and WebKit pass preview, all 480 shuffled states and complete native 720p export; Chromium also passes 1080p and the demo download. All five outputs pass independent full decoding, timestamps, visual markers and audio synchronization checks, with a largest absolute audio-marker error of 0.08333 ms. The known 648-sample native tail and EOF diagnostic remain recorded. Node 22's nine shared-set checks and the eight isolated scope-migration checks pass again after preparation changes. Fresh metadata packing confirms that the current checkout produces identical archive hashes; artifacts/seven-package-release/report.json compares every consumer against those seven archives. CI, API/quickstart and the final manifest/checklist remain unfinished; no publication occurred.

The API reference now documents all seven root packages, schema versioning, diagnostic ranges/paths, rational time, immutable plans versus owned DrawLists, atomic patches, explicit asset ownership, React readiness, Node/browser export contracts and CLI exits. The quickstart uses the unpublished local archives and existing real examples. The existing isolated Node consumer extracts the marked Markdown examples, executes them against the seven tarballs, and checks their JavaScript types with strict/checkJs and skipLibCheck:false. Exact outputs verify frame 97 at 4,041,667 microseconds and a successful revision-one/layer-one patch with serialized-plan roundtrip. All ten consumer checks pass, including full installed CLI export. An audit names all 43 public runtime exports and checks 29 local Markdown links. See docs/api.md, docs/quickstart.md and artifacts/documentation-consumer; CI and final release preparation remain unfinished.

The local CI/release closure now prepares pinned acceptance/release workflows and a seven-archive bundle with source, tool, archive and evidence hashes. The full local command matrix finished with fourteen PASS commands and one preview failure; two full-run incidents are preserved. A subsequent preview-only reproduction passes three zero-drop plays at 1.90 ms p95, but its cause remains unresolved and the full matrix remains FAIL. Diagnostic capture now prevents stale reports from standing in for a failed run. Hosted Ubuntu execution is pending. npm authenticates as ferxalb, but the organization E404 does not establish @aether-fx authority; canonical GitHub visibility is public. The bundle stays publicationReady=false and contains the failure history. See RELEASE-READINESS.md, docs/release.md and artifacts/ci/preview-diagnosis.json.
