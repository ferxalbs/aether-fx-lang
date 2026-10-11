# AETHER Fx 0.2.0-rc.3 readiness

**Local candidate unapproved.** Three unchanged bundle caps and the native export speed target fail. Linux qualification remains pending; packaging does not establish publication readiness. RC.2 stays intact as the reference.

The default server renderer remains Skia (@napi-rs/canvas 1.0.11), producing raw RGBA for external FFmpeg 8.0.1 with one pending write and backpressure. A Buffer view now avoids copying independently owned frame data; its lifetime extends through the write callback. Chromium is explicit compatibility/oracle rendering. `@aether-fx/node/integrated` and its optional @mediabunny/server 1.61.3 / node-av 6.1.1 / Mediabunny 1.61.3 peers remain isolated, with exact binary distribution unqualified. No native encoder investigation or dependency change is part of RC.3. LICENSE, NOTICE and Nunito/OFL remain unchanged.

| Technical gate | Result / evidence |
| --- | --- |
| Build, types, regressions | PASS; 128 tests, including independent ownership of retained native pixels |
| Final full acceptance | 28/29 PASS; only bundle gate FAIL; one complete run on final code, recorded in candidate evidence/acceptance.json |
| Native lifecycle | PASS; pre/mid abort, timeout, encoder/callback failures, no overwrite, observed processes reaped, successful MP4, size limit |
| Native fidelity | Eight fresh oracle poses PASS (max MAE 0.0874, differing-pixel ratio 0.003956); deterministic rerender PASS; 480 timeline/scene states PASS |
| Native audiovisual output | Three WebM runs independently decoded: 480 frames, 20 s, 24 fps, stereo 48 kHz, visual/audio markers PASS; every video PTS within 0.334 ms; full native/browser MP4 decode PASS |
| Bundles | Core 10468/10163 FAIL; Player 4339/5758 PASS; Compiler 46549/40920 FAIL; Export 35777/35351 FAIL (gzip bytes, unchanged caps) |
| Native external speed/memory | Three runs: 11.2267 / 11.2630 / 11.5177 s; factors 0.56134 / 0.56315 / 0.57588 FAIL; tree RSS 532.035 / 556.215 / 532.059 MiB PASS vs 700 |
| Examples / preview / robustness | PASS; twelve authoring examples, twelve scene variants, three full preview plays, 100000 fuzz inputs without unexpected crashes/timeouts, playground, clean quickstart, Node/Next/browser consumers |
| Bun | Bun 1.4.2 native/external MP4 12-frame smoke PASS; full Bun acceptance unverified |
| Linux / hosted CI | No local Linux VM/container available; consulted hosted runs target earlier commits and failed; RC.3 Linux remains unverified |
| Generation metrics | Authored tests/examples and recorded harness are distinct from real model generation; live metrics NOT MEASURED |

Internal ESM boundaries and exact immutable schema interning improve size without changing public APIs, diagnostics or language semantics. All required dependencies are counted in the standalone browser bundles; metafiles retain module contributions/imports. Compiler is dominated by Chevrotain's parser/lexer/grammar infrastructure. Profiling identifies external VP9 encoding as the remaining export bottleneck under unchanged quality/thread settings; speculative prefetch was removed. Timing variance does not establish a reliable wall-time improvement from one before/three after samples. [Performance](docs/performance-v0.1.md) records methods and all results.

The seven RC.3 archives, full source/module hashes, reports, manifest and SHA256SUMS are prepared in `artifacts/release-v0.2.0-rc.3`. Detailed session records and previous active outputs are preserved privately outside the public checkout. No push, publication, deployment, history rewrite or license change is performed.

The subsequent bounded build/profiling follow-up is **not another release candidate**. Schema counting removes single-use aliases while preserving all rules: working Core/Player/Compiler/Export sizes are 10455/4339/46534/35764 gzip bytes, with the same three failed caps. Build, types, 128 regressions, schema equality and independent profile-video decode pass. FFmpeg arguments/filter negotiation confirm one RGBA → YUV420p conversion and unchanged encoding parameters; no speed improvement is claimed. RC.3 acceptance, benchmark runs, tag and archives remain unchanged. Full acceptance has not been repeated for this follow-up. Linux qualification requires an authorized push of the reviewed source ref and execution of the existing Ubuntu Node 22/24 workflow; earlier hosted failures do not qualify it. See the bounded follow-up in [performance documentation](docs/performance-v0.1.md).

Linux validation preparation now provisions and probes the required libx264/AAC codecs only in CI, generates three native benchmark inputs from versioned assets and separates snapshot assembly into another job. It is not an executed Linux qualification. Original bundle caps and measured macOS speed FAILs remain unchanged; the v0.2 budget proposal is explicitly unapplied. New CI consumer archives have their own hashes and do not replace RC.3. See [Linux validation](docs/linux-validation.md).

The first Linux execution, [38168445048](https://github.com/ferxalbs/aether-fx-lang/actions/runs/38168445048), verified `fbe8745`, not the RC.3 archives: both Node jobs recorded 25/29 PASS, with bundles, Next preview, WebKit Opus coverage and the release verifier failing. Both assembly jobs were blocked. Scoped corrections retain diagnostic FAIL reports, observable Play/Pause checks, structured Vitest results and refusal of incomplete Opus encoding. Current gzip sizes are Core 10455/10163 FAIL, Player 4339/5758 PASS, Compiler 46534/40920 FAIL and Export 36222/35351 FAIL. The export integrity guard adds 458 gzip bytes to the prior working bundle; its cap is unchanged. No new candidate, hosted rerun or publication approval is claimed. The reference-host speed FAIL remains unchanged.
