# AETHER Fx v0 release readiness

Status: **IMPLEMENTED AND PACKAGED; local acceptance PASS; final hosted acceptance FAIL; execution paused; npm publication pending and not authorized.**

Corrected implementation commit: `3c589a9aa3777d3fadc831ed7c2e34cd26016876` on `codex/fix-head-torso-acceptance`. Draft review: https://github.com/ferxalbs/aether-fx-lang/pull/1. Final hosted run: https://github.com/ferxalbs/aether-fx-lang/actions/runs/38110114744. This closure document may contain reporting updates after the tested implementation commit; it does not change package code.

## Corrected acceptance short

The generator adds a skin neck bridge behind the collar and head, overlapping chin and shoulders. The regenerated character has thirteen parts. Comparing all 480 evaluated frames with the earlier fixture shows that all existing commands are unchanged; the neck is the only new command.

The corrected `.afx` SHA-256 is `6091b3999a0520dedb9a63fe0de14764ca504a443e21767e362e276ad56bec0e`. Eight start/intermediate/end frames, 0/97/144/174/204/274/384/479, pass the actual Chromium pixel test: three vertical corridors, 198 pixels per frame. Hiding the bridge makes the same check fail. Antialiased skin/collar/shirt mixtures use RGB tolerance 2; background pixels are rejected.

Both newly regenerated VP9/Opus WebM files pass all eight decoder checks: 480 frames, 20-second video content, exact 960000 decoded 48 kHz audio samples and maximum audio alignment error 0.0834 ms. The 720p and 1080p files are under `artifacts/short`. The eight decoded-video images in `video-contact-sheet.png` were visually inspected and show a connected neck through the final close-up. Earlier videos and checksums are preserved under `artifacts/short/pre-neck-video-history`.

## Executed verification

| Command / evidence | Result | Exact scope |
| --- | --- | --- |
| `npm run verify:ci` / `artifacts/final-acceptance/local/acceptance-report.json` | PASS, local | All fifteen commands completed after the neck correction on `1baab1c`; strict build/typecheck and 108 tests, isolated tarball consumers, rendering/decoding, migration, memory and preview |
| `node scripts/inspect-short.mjs` | PASS, local and first two hosted runs | Eight connection references and missing-neck negative control; existing six-frame expression patch remains confined to the mouth |
| `node scripts/verify-package-metadata.mjs` | PASS, corrected verifier | Seven real tarballs; Apache-2.0 and exact `Copyright 2026  Fer's` NOTICE; actual repository metadata, exports, internal version protocols and preserved Nunito OFL |
| Isolated real-Git remote regression | PASS | Both canonical HTTPS URL forms accepted; different owner/repository rejected before packing; report in `artifacts/final-acceptance/repository-regression.json` |
| `node scripts/verify-react-next.mjs artifacts/final-acceptance/next-binary-regression-fixed artifacts/metadata-packages` | PASS, local | Seventeen checks against the seven freshly rebuilt archive hashes, production Next/SSR/hydration, exact frame 97 PNG, navigation and fifty StrictMode lifecycle cycles |
| Node and browser export verification | PASS, local | Packaged CLI reference export; Chromium/Firefox/WebKit native export; all five browser files independently decoded; Node/native 20s/60s bounded queues and cleanup |
| `node scripts/benchmark-preview.mjs`, in corrected local matrix | PASS, cause unresolved | Three full 480-draw plays, zero drops, p95 1.90 ms, same 30-second wait and 41.67 ms budget; raw audio/RAF/control instrumentation retained |
| `npm run build && node scripts/verify-package-metadata.mjs` on `3c589a9` | PASS | All seven packages rebuilt and packed after corrections; checksums recomputed; latest Next consumer matches every hash |
| Hosted Ubuntu 24.04 / Node 24.21.0 and 22.12.0 | FAIL, both jobs completed | Run 38110114744: nine commands PASS, Next Play/Pause FAIL, remaining five not executed |

Reference local environment: macOS 15.7.7 x86_64, iMac20,1, Intel i5-10400F, 24 GiB RAM; Node 24.21.0/npm 11.19.0, Playwright 1.64.0/Chromium 156.0.8078.4, FFmpeg 8.0.1, React 19.3.0/Next 16.4.0. These measurements do not imply physical-mobile support.

## Preserved failures and diagnosis

- Historical preview: first full run skipped three frames with a 160.2 ms RAF gap despite callback maximum 2 ms; the next full run timed out during the third play. The original timeout harness did not retain frame/audio state. Both failed matrices remain under `artifacts/ci/failed-preview` and `artifacts/ci/timeout-preview`. Passing subsequent runs do not establish either a product or environment cause. Instrumentation now retains audio state/time, resume operations, control events, visibility, RAF samples and timeout snapshots, and invalidates stale reports at startup.
- Hosted run 38107775230: both jobs failed at repository metadata because checkout used the canonical URL without `.git`. The verifier now compares equivalent URL forms while still rejecting another repository. Full logs and reports remain under `artifacts/ci/first-hosted-failure`.
- Hosted run 38108381258: both jobs passed the first nine commands, then failed the exact Next/offline frame-97 PNG comparison. Next used the default separate headless shell; offline used pinned full Chromium. The Next verifier now selects that same full binary and records an A/B shell/full comparison, images and decoded-pixel counts. Run 38109219910 confirmed Linux causality: full Chromium matches exactly with zero differing pixels; shell differs in 3041 pixels on Node 24. Both hosted Next consumers pass all seventeen checks. Exact PNG equality remains required.
- Hosted run 38109219910 then stopped at Firefox preview: frame failed to advance after the user gesture. Ten acceptance commands passed; the browser matrix and later gates remained incomplete. Run 38110114744 first reproduces only Firefox with audio/timeout-state capture. A captured zero clock and unresolved resume permit configuring a real virtual PulseAudio sink in the runner; Firefox is rerun separately before complete acceptance. The before/after evidence now confirms this Firefox incident was caused by missing runner audio output: baseline clock zero and unresolved resume, followed by successful playback/export/decoding with PulseAudio on both jobs. This does not establish the cause of the historical macOS preview incidents or the subsequent Next failure.
- Full Chromium exposed missing `/favicon.ico` requests in the example. Console locations confirmed both 404s. An original lantern `app/icon.svg` fixes the missing resource; errors are not filtered out. The corrected Next check passes locally.
- The local Chromium cache was absent when regenerating videos. Reinstalling the pinned browser restored export; the dependency failure occurred before rendering. Export also correctly rejected the earlier output file; those files were preserved before generating replacements.

## Packages and publication boundary

Seven unpublished ESM packages at version 0.1.0: `@aether-fx/core`, `compiler`, `canvas`, `react`, `export`, `node`, `cli`. Archives, SHA256SUMS, source/asset snapshot, docs, changelog, evidence and gate checklist are under `artifacts/release`. The corrected short is outside the npm archives by design. Rebuilding yields identical package hashes because this task changes the generator/fixture and verification/example files, not library payloads. The new manifest must identify the corrected source rather than pretending unchanged bytes have a new checksum.

Apache-2.0 applies to original code; the exact owner-confirmed notice is `Copyright 2026  Fer's`. Third-party font and dependency notices remain preserved. Repository: https://github.com/ferxalbs/aether-fx-lang.

## Remaining blockers and limits

1. **Hosted acceptance FAIL:** both final jobs completed with nine commands PASS and Next Play/Pause assertion FAIL at `scripts/verify-react-next.mjs:56` after 180 ms. Exact frame-97 pixels passed. The cause is not established; Next clock/resume timing was not captured. Five later commands did not execute. See `KNOW-ISSUES.md` and preserved current logs under `artifacts/ci/hosted-audio-diagnosis`. Complete Ubuntu acceptance remains required.
2. **Publication configuration, intentionally pending:** authenticated `ferxalb` identity does not prove authority over `@aether-fx`; organization lookup returned E404. Scope/package permissions, first-publication bootstrap and trusted-publisher/OIDC settings remain unverified. `publicationReady=false`; no npm publication performed or authorized.
3. **Historical preview intermittency, unresolved risk:** no cause has been established. This is retained independently of the current executed gate result; no timeout, drop criterion or performance budget has been relaxed.

Physical mobile, physical display/speaker latency and optional MP4 remain unverified limitations. Reference WebM acceptance uses 480 decoded frames and exact Node audio content. Native browser Opus retains its measured 648-sample tail; FFmpeg's documented EOF parser diagnostic is preserved alongside zero decode errors. Neither is silently discarded or used to relax the reference criteria.
