# Known issues and qualification limits

This is the single register of current defects, mitigations and pending validations. Recording an issue does not resolve it or approve a release. Historical FAIL results remain valid for the sources and platforms they tested. [Readiness](RELEASE-READINESS.md) records candidate evidence; technical guides retain reproduction methods.

## KI-01 — Linux WebKit Opus content loss

**Status:** confirmed defect, guarded; encoder not repaired. **Scope:** native browser Opus on the Linux WebKit configuration in [run 38168445048](https://github.com/ferxalbs/aether-fx-lang/actions/runs/38168445048). A 960000-sample input produced 1000 packets of 960 samples with 312 pre-skip samples; independent decode returned 959688 samples. The missing 312 samples contain content, not acceptable tail padding.

**Impact:** incomplete audio cannot be accepted. The probe and final coverage guard detect/reject insufficient output; the corrected guard is not yet hosted-Linux qualified. **Alternative:** Skia + external FFmpeg in Node. **Resolution:** the affected encoder must preserve submitted content after priming, with independent decode proving sample coverage, duration and audiovisual synchronization under the original criteria; then verify probe/export behavior on Linux. No appended silence or relaxed equality. See [browser export](docs/browser-export.md).

## KI-02 — Post-fbe8745 Linux qualification

**Status:** validation pending. **Scope:** corrections in `b5243ce` and subsequent changes; hosted Node 22/24 acceptance and assembly. The first run tested `fbe8745` and failed; it does not qualify later code.

**Impact:** local macOS checks do not establish Linux compatibility or a complete candidate. **Alternative:** use the locally verified platform with its documented limits. **Resolution:** an authorized reviewed ref must execute the existing Ubuntu workflow, preserving every gate outcome and diagnostic artifact; mandatory FAILs still block release. See [Linux validation](docs/linux-validation.md) for workflow, encoder provisioning and permissions.

## KI-03 — Next Play/Pause historical failure

**Status:** test mitigation verified locally; historical cause pending. **Scope:** Next integration test in the first Linux run. The test now waits for observable drawn-frame advancement with a bounded timeout and verifies that Pause stops frame/draw advancement and audio. A controlled pending audio resume demonstrates that the previous fixed 180 ms wait can fail with correct cancellation. No runtime defect is demonstrated.

**Impact:** the historical failure cannot yet be attributed to the runner's exact startup behavior. **Alternative:** the observable-condition test with player, clock, audio, visibility and frame diagnostics. **Resolution:** run the instrumented check on Linux, inspect failures if any, and establish Play/Pause behavior without weakening either assertion.

## KI-04 — Standalone bundle budgets

**Status:** current size policy accepts the implemented authoring scope; historical budget FAILs retained. **Scope:** standalone gzip measurement with unchanged accounting and import isolation. Current caps cover reproduced Core/Compiler/Export sizes without added reserve; Player retains its previous cap.

| Bundle | Measured B | Original cap B | Accepted cap B | Current status |
| --- | ---: | ---: | ---: | --- |
| Core | 16473 | 10163 | 16473 | PASS |
| Player | 5535 | 5758 | 5758 | PASS |
| Compiler | 52744 | 40920 | 52744 | PASS |
| Export | 41490 | 35351 | 41490 | PASS |

The preceding source measured 10455/4339/46534/36222 B respectively: core, compiler and export already failed the original caps. Vector authoring adds procedural geometry, curve editing, contact, material/clip contracts, schema validation and compiler normalization. Compiler and Export also retain reachable core validation; their standalone totals overlap and are not additive. The increase is accepted for these delivered capabilities, with optimization deferred. No parser or Node tooling enters Core/Player, and optional codecs remain outside default Export.

**Impact:** the previous size-only release block is removed for the accepted scope; other release gates and platform/codec limitations remain independent. Historical RC.3 results and archives are not requalified. **Follow-up:** retain measurements and import checks; explain further growth by delivered functionality and inspect contributions before explicitly updating a cap. The earlier [v0.2 reserve proposal](docs/performance-v0.1.md#proposed-v02-bundle-policy--not-applied) remains unapplied; this decision adopts measured sizes without its reserve. See the [accepted policy](docs/performance-v0.1.md#accepted-unreleased-vector-authoring-bundle-policy).

## KI-05 — Reference-host export speed

**Status:** mandatory performance FAIL; measured memory PASS. **Scope:** 20 s, 720p, 24 fps reference workload with unchanged codec/quality on the documented i5-10400F / 24 GiB macOS host. Three RC.3 runs took 11.2267, 11.2630 and 11.5177 s (factors 0.56134, 0.56315 and 0.57588); all exceed 10 s / factor 0.5. Aggregate RSS remained below 700 MiB. Profiling identifies external FFmpeg encoding as the remaining bottleneck.

**Impact:** the throughput target is not met. **Alternative:** use the measured slower export path; browser export is separately capability-dependent. **Resolution:** three comparable runs and independent decode must meet the original speed/memory criteria, or a separate explicit requirements decision is needed. Earlier Linux timings remain observations on another host and cannot qualify this target. Methods and all historical results remain in [performance](docs/performance-v0.1.md).

## KI-06 — Integrated encoder distribution

**Status:** distribution qualification pending, not a prohibition on GPL distribution. **Scope:** opt-in `@aether-fx/node/integrated`, @mediabunny/server 1.61.3, node-av 6.1.1 and their exact FFmpeg binaries. A local smoke test establishes operation, not redistribution compliance.

**Impact:** the integrated encoder cannot be presented as a qualified default distribution. **Alternative:** default Skia renderer streaming RGBA with backpressure to separately installed FFmpeg; Chromium remains explicit compatibility rendering. Separate installation does not waive third-party obligations. **Resolution:** verify shipped binary/source correspondence, linked libraries, build flags, install downloads, licenses, notices and applicable source provision for the exact distribution. See [licensing](docs/licensing.md) and [Node export](docs/node-export.md).

## KI-07 — Browser codec and AAC conformance

**Status:** capability limitation and observed native AAC onset/metadata failures. **Scope:** device/configuration-specific WebCodecs, including headless environments; browser name alone is insufficient.

**Impact:** browser export can be unsupported despite nominal codec availability. **Alternative:** actual probes, optional explicit AAC WASM entry where verified, or Node export. **Resolution:** independent decode must verify frames, audio coverage, metadata, duration and onset below one frame on each claimed setup. See [export capabilities](docs/export-v0.1.md); retain AAC WASM's separate licensing obligations.

## KI-08 — Raster and platform qualification

**Status:** documented rendering limit; validation pending outside measured setups. **Scope:** fonts, shaping and antialiasing across renderers/platforms; physical devices and full Bun lifecycle/platform acceptance. Bun 1.4.2 has only a native/external 12-frame smoke test.

**Impact:** deterministic evaluated state does not guarantee identical cross-platform pixels or universal runtime compatibility. **Alternative:** use a verified backend/font/platform combination; Chromium is an explicit visual compatibility option, Node the reference runtime. **Resolution:** qualify each claimed platform with applicable fidelity, font, lifecycle and audiovisual checks under declared tolerances. See [architecture](docs/architecture.md) and [export capabilities](docs/export-v0.1.md).

## KI-09 — Preview intermittent failures

**Status:** historical defect reports unresolved. **Scope:** preview dropped-frame/timeout observations, separate from the Next fixed-wait test.

**Impact:** isolated instrumented passes do not establish a repair. **Alternative:** absolute-frame seeking and offline export for reproducible output. **Resolution:** retain a failing reproduction with clock/audio/visibility/frame diagnostics, identify its cause and verify the correction under the affected conditions. See [performance methods](docs/performance.md).

## KI-10 — Features outside the implemented candidate

**Status:** partially implemented, remaining features not delivered. **Scope:** bounded local linear/radial gradients and vector shape clipping now use the shared Canvas/Skia renderer. General blur/shadow parity, complete text layout/reveal, multiple audio tracks and blend modes remain outside the candidate.

**Impact:** users cannot rely on the remaining features in the current candidate. **Alternative:** documented local fills, clips, vector contact-shadow drawings, supported text and single-track audio contracts. **Resolution:** further implementation must specify semantics and verify applicable backend parity; unknown/unsupported constructions must diagnose instead of disappearing. See [language](docs/language-v0.1.md).

## KI-11 — Live model-generation metrics

**Status:** not measured. **Scope:** real-provider first-attempt/repair success, scene quality, token reduction and usage/cost claims.

**Impact:** authored examples, tests and recorded replay do not demonstrate live generation rates. **Alternative:** use the documented authoring pack and recorded harness as reproducible tooling checks only. **Resolution:** separately authorized live evaluation must record provider/model/configuration, frozen split, responses, diagnostics and actual usage under the [evaluation protocol](docs/llm/evaluation.md).

## KI-12 — Vector authoring and projected assemblies

**Status:** bounded public authoring implemented and verified locally; broader geometry, artistic and platform qualification pending. **Scope:** `solid` declarations provide convex extrusion, polygonal cylinders, fixed orthographic/isometric projection, face materials, editable recipes, stable landmark IDs and projected anchors. Node contours expose corner/aligned/mirrored handles and centripetal Catmull–Rom conversion. Local gradients and vector clipping share the browser/native renderer. Interval contacts preserve world pose on bind/release, diagnose singular matrices/shear and use absolute-frame sampling; layer changes are discrete. The existing playground adds diagnostic overlays and critical-frame sheets.

**Bounds:** extrusion requires strictly convex simple rings. Concave/crossing contours require split pieces and explicit layers. `orderProjectedFaces` detects overlap depth reversal, coplanar ambiguity and painter cycles for convex planar faces, but does not automatically audit animated assemblies. Projection is baked; there are no arbitrary 3D camera orbits, IK, general transparent geometry or global self-intersection guarantees. Cylinder steps/visibility and node topology changes require morph correspondence review. Contact chains and unrepresentable 2D shear are rejected. Contact-bearing shots are limited to 4096 frames and 16 intervals; compile audits their integer frames, including release and shot boundary. Subsequent scale magnifies the declared cylinder approximation bound.

**Verified behavior:** `npm run check` passes 144 tests on macOS/Node 24.21.0, including roundtrips, stale recipe/node detection, winding/topology, degeneracy, contact bind/release and singular/sheared matrices, discrete layers and random seek. Historical fixtures remain valid; the offline parametric adapter retains its original canonical output. The public scenes `fixtures/short/little-light-authored.afx` (480 frames, retained character/shot lengths) and `fixtures/assembly/guide-carriage.afx` (240 frames, dimension-varied guide components) render with the native backend. Exhaustive shuffled state comparison covers their 720 frames. Raster/state parity is sampled at 23 critical frames under unchanged mean absolute channel error <=2 and differing-pixel ratio <=0.05. An additional ten-frame case verifies linear/radial fills, evenodd clipping and rotated contact under a nonuniform camera (maximum MAE 0.031589, differing-pixel ratio 0.001654). This is sampled macOS verification, not proof of every occlusion, arbitrary assemblies or other platforms. Full images and contact/intermediate poses require visual inspection in addition to tests.

**Historical evidence:** the original 384-frame `fixtures/parametric/lamp-table.afx` demonstrator remains supported. Its four Node tests and `node scripts/verify-parametric-demo.mjs` previously verified all-frame state/pixel parity (maximum MAE 0.002889, differing-pixel ratio 0.000220), a sampled front-finger visibility criterion and decoded export frame counts. Its identity-transform parenting example does not establish generic contact semantics; the new interval API has separate tests.

**Impact:** these examples demonstrate bounded reusable authoring and authored ordering. They do not qualify a release, close the remaining speed/platform/codec gates or establish general physical contact/non-penetration. The accepted bundle-size policy is recorded in KI-04. **Alternative:** split unsupported forms into convex pieces, author explicit depth layers and corrective drawings, and inspect frame boundaries. **Resolution:** retain current diagnostics and budgets; qualify additional geometry/platform claims separately. Single-host evaluation/draw/export observations and coordinator RSS do not establish causal performance improvement or whole-process-tree memory. See [public authoring contracts](docs/language-v0.1.md#public-projected-solids-editable-curves-and-contact), [API](docs/api.md) and KI-04/KI-05 for unresolved gates.

## KI-13 — Native WebM Opus decode diagnostic

**Status:** reproduced diagnostic, cause and audio impact pending. **Scope:** native/external-FFmpeg WebM exports of the historical `fixtures/short/little-light.afx` and its authored successor on macOS, Node 24.21.0 and FFmpeg 8.0.1. `ffmpeg -v error -i video.webm -f null -` exits zero but emits `Error parsing Opus packet header`. The historical baseline export produced the same diagnostic before the vector-authoring changes. A zero exit status alone does not establish clean audio decode.

**Impact:** the affected WebM audio must not be described as fully qualified. Video frame counts pass; this diagnostic does not establish a geometry regression. **Alternative:** the authored short's native MP4 passes the existing `verify-mp4.mjs` frame/audio/synchronization check; the asset-free assembly WebM decodes without diagnostics. **Resolution:** identify the affected Opus packet and verify content/sample coverage independently without hiding decoder diagnostics or relaxing criteria. The MP4 observation is local validation, not universal codec qualification.
