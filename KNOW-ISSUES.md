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

**Status:** mandatory budget FAIL; import isolation passes. **Scope:** current standalone gzip measurement, unchanged accounting and caps.

| Bundle | Measured B | Cap B | Status |
| --- | ---: | ---: | --- |
| Core | 10455 | 10163 | FAIL |
| Player | 4339 | 5758 | PASS |
| Compiler | 46534 | 40920 | FAIL |
| Export | 36222 | 35351 | FAIL |

**Impact:** size gates block release; this is distinct from functional test failures. **Alternative:** current functionality is usable within its platform limits, but packaging is not approval. **Resolution:** `node scripts/verify-bundle-budgets.mjs` must pass unchanged caps/accounting, or an explicit reviewed product-budget decision must establish new requirements. The [v0.2 proposal](docs/performance-v0.1.md#proposed-v02-bundle-policy--not-applied) is unapplied and predates the Opus guard's additional 458 gzip bytes; its export measurement is historical. No further tree-shaking saving sufficient for the compiler cap has been demonstrated through supported Chevrotain interfaces.

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

**Status:** not delivered. **Scope:** full gradient/shadow parity, complete text layout/reveal, multiple audio tracks, shape clipping and blend modes.

**Impact:** users cannot rely on these features in the current candidate. **Alternative:** the documented primitives, supported text and single-track audio contracts. **Resolution:** a separately scoped implementation must specify semantics and verify applicable backend parity; this closure adds no features. See [language](docs/language-v0.1.md).

## KI-11 — Live model-generation metrics

**Status:** not measured. **Scope:** real-provider first-attempt/repair success, scene quality, token reduction and usage/cost claims.

**Impact:** authored examples, tests and recorded replay do not demonstrate live generation rates. **Alternative:** use the documented authoring pack and recorded harness as reproducible tooling checks only. **Resolution:** separately authorized live evaluation must record provider/model/configuration, frozen split, responses, diagnostics and actual usage under the [evaluation protocol](docs/llm/evaluation.md).

## KI-12 — Vector authoring and projected assemblies

**Status:** bounded parametric demonstrator implemented; broader authoring and artistic qualification pending. **Scope:** `fixtures/parametric/lamp-table.afx` and its optional offline authoring scripts deliver convex extrusion, polygonal cylinders with declared tolerance/budget, orthographic projection, persistent face IDs for dimensional edits with fixed sampling, orientation-based solid colors, separation/reassembly and a prepared mechanical grip/lift. Editable nodes/handles and explicit smoothing, geometric morph diagnostics beyond topology matching, generic FK/IK/contact, an authoring inspector and arbitrary assembly occlusion are not delivered. Gradient/clipping and text-layout limits remain under KI-10.

**Impact:** the demonstrator is not a general assembly authoring system or qualification of character acting/contact. It uses authored piece ordering and opaque glass. Cylinder shading remains faceted; same-tone side faces now share a single fill path to eliminate internal antialiasing seams without expanding their silhouette. Boundaries between different materials/tones retain normal raster antialiasing. Its grip example preserves world pose because the attachment transforms are identity, not because arbitrary reparenting/TRS decomposition has been implemented. No silhouette, motion or renderer defect is established solely by a storyboard image. **Alternative:** use the documented offline constructors within their convex/sampling limits, prepare cubic shapes and drawings for other forms, and author ordering/contact offsets explicitly.

**Resolution:** the existing Node suite checks regeneration, dimensional edits/topology changes, grip surface contact and every frame in shuffled/reverse order. A raster regression checks same-tone cylinder joints in assembled, separated and lifted poses on an isolated surface, preserves original face contours, and confirms that separate per-face fills reproduce the leak. `node scripts/verify-parametric-demo.mjs` checks all 384 evaluated/rendered frames, declared framing and renderer tolerances, a front-finger visibility sample throughout attached lifting, decoded export frame counts, and single-run timing/coordinator RSS against The Little Light at the same output resolution. These are bounded checks: sampled visibility is not a proof of arbitrary 3D non-penetration or every occlusion relationship. Independent artistic review, comprehensive joint/occlusion review, cross-platform parity and isolated process-tree memory remain pending. Broader character acceptance must inspect the complete short and every frame around contact/lifting; mechanical-object evidence does not replace it. See [authoring limits and commands](docs/language-v0.1.md#offline-parametric-lamptable-demonstrator). None of these checks closes the existing release gates.
