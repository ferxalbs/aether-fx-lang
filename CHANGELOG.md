# CHANGELOG

## Unreleased — bounded follow-up to RC.3

Avoid single-use runtime schema aliases by counting children of shared subtrees once during build. Public schema, APIs and diagnostics are unchanged. Core and Export each save 13 gzip bytes; Compiler saves 15. Their original size gates remain failed. The native export profiler records the actual FFmpeg command and offers explicit verbose filter diagnostics without changing production encoding. RC.3 remains intact; no new candidate or encoding policy change is delivered.

CI preparation adds runner-only libx264/AAC provisioning with an encode probe, reproducible native benchmark inputs and separate validation/assembly jobs. A v0.2 bundle-budget proposal remains unapplied; original failures and immutable RC.3 artifacts are retained. The first Linux execution failed; its results remain preserved.

Next acceptance replaces the fixed Play delay with instrumented frame advancement and a bounded timeout, retains Pause stability and pending-Play cancellation checks, and writes diagnostics on failure. Opus capability/export guards reject insufficient decoded coverage after pre-skip instead of accepting truncated audio. Release verification consumes structured Vitest JSON and process results. Assembly distinguishes missing/failed evidence, blocks failed acceptance and uploads diagnostics even without a candidate. Caps, codecs, quality, native rendering and immutable RC.3 archives are unchanged; corrected Linux execution remains pending.

## 0.2.0-rc.3 — size and export optimization, unapproved

Browser packages preserve internal ESM module boundaries instead of flattening unused module initialization into their entry point. Runtime schema rules share repeated immutable values; the exported JSON schema and diagnostics remain unchanged. The default player bundle passes its original cap; core, compiler and export still exceed theirs. No dependency, cap or public API changes.

Native Skia export retains raw RGBA ownership through a Buffer view until the FFmpeg write callback completes, avoiding an extra frame copy with the same bounded queue and encoding parameters. Benchmark evidence identifies all emitted runtime modules as well as entry points. Three consecutive 20-second/720p measurements remain above the speed target; memory passes. Expanded native lifecycle checks cover encoder/callback failures and process cleanup. RC.2 remains an immutable reference; see RELEASE-READINESS for final acceptance and limitations.

## 0.2.0-rc.2 — distribution preparation

Node video export defaults to Skia with streamed external FFmpeg encoding and backpressure. Chromium remains an explicit compatibility renderer. The recovered integrated encoder is isolated at `@aether-fx/node/integrated` with optional peers; its exact binary distribution remains unqualified. Browser MP4 moves to `@aether-fx/export/mp4`; AAC WASM is an optional peer at `/aac`, outside the default install graph. WebM remains default.

The MP4 entry split removes accidental muxer weight from WebM. Original bundle caps are unchanged; residual excess remains a failed release gate. Packages retain exact Apache-2.0 LICENSE/NOTICE and Nunito/OFL. Public documentation and release artifacts contain technical references/evidence rather than internal records. See RELEASE-READINESS for candidate checks and limitations.

## 0.2.0-rc.1 — local candidate, unapproved and unpublished

Adds bounded primitive/SVG geometry, rational time/anchors/stagger, compile-time const/theme/component/instance/repeat authoring, named/analytic spring easing, structured diagnostics/safe fixes, formatting and canonical expansion. Existing v0/schema-1 documents and all 480 reference states remain valid.

Adds native Skia/Mediabunny/NodeAV Node WebM/MP4 export, optional browser AAC WASM, content hashing/benchmarks, brief scenes, LSP/TextMate and static playground. Seven exact local archives have isolated Node/Next/browser consumer evidence. Tests, corpus, visual references, independent decode and comparable backend measurements accompany the candidate.

Release approval remains failed: unchanged bundle caps exceed their baseline. Linux/native qualification, new hosted CI, model-generation metrics and dependency/platform qualification are unmeasured; A5 effects/A6 complete text layout are deferred. No push, publication or deployment occurred. Apache-2.0 and the confirmed NOTICE are unchanged.

## v0.1.0 (Canary Preview 1) — The First Canary

Initial experimental ESM release: canonical schema version 1, pure compilation/direct frame evaluation, Chevrotain DSL with source diagnostics, explicit cubic topology, revision-checked atomic edits, Canvas playback/resources, React client player, contained Node asset loading and Chromium/FFmpeg export, native WebCodecs/Mediabunny browser export, and the afx CLI.

The original illustrated 20-second reference short exercises real font/image/stereo audio, poses/drawings, contact, parallax and layers. Local Node 24/22, production Next/StrictMode and Chromium/Firefox/WebKit consumers use the same seven archive hashes. Complete audiovisual decode, lifecycle, performance and 20s/60s process-memory evidence is retained. Original work is Apache-2.0 with the confirmed copyright notice; third-party notices are preserved.

API and quickstart documentation are verified against real packages. Physical mobile and optional MP4 acceptance remain unverified. Hosted CI results are separate from local acceptance. No npm publication is part of this entry.

The corrected reference short has a connected neck, pixel regression checks and regenerated 720p/1080p WebM outputs. The corrected local acceptance completed fifteen commands PASS. Final hosted run 38110114744 on 3c589a9 failed in both Node jobs at Next Play/Pause after nine passing commands; five subsequent commands did not execute. Historical preview intermittency remains unexplained. Logs, images and limitations are retained in KNOW-ISSUES.md and the release evidence; publication remains pending.
