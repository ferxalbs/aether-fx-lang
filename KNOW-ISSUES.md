# Known issues — AETHER Fx v0

Recorded closure status: **implementation corrected and packages prepared; hosted acceptance FAIL; publication pending**. The previous acceptance work stopped at the user's request. No additional suite or implementation changes were performed for that closure.

Commit executed in CI: `3c589a9aa3777d3fadc831ed7c2e34cd26016876`.
Run: [hosted acceptance 38110114744](https://github.com/ferxalbs/aether-fx-lang/actions/runs/38110114744).

## Current technical blockers

### 1. Next: Play does not advance beyond frame 97 before Pause — OPEN

The `acceptance (22.12.0)` and `acceptance (24.21.0)` jobs ended in FAILURE. Each completed nine commands with PASS, then failed the tenth; five subsequent commands did not run.

Failed command: `node scripts/verify-react-next.mjs artifacts/ci-next artifacts/metadata-packages`.
Assertion: `scripts/verify-react-next.mjs:56`, Play → fixed 180 ms wait → Pause → selected frame must be greater than 97. That condition was not met. The exact frame-97 PNG comparison passed. Diagnostics contain no console errors or failed requests.

**The cause is not established.** This Next run did not capture clock state or `AudioContext.resume()` latency. The audio startup delay observed in Firefox suggests an environment hypothesis, but does not establish the Next cause or rule out a product bug. For a future investigation, reproduce only this consumer and capture the clock, resume, Play/Pause and frame; fix according to the evidence without changing the wait or criterion merely to force PASS.

Evidence: `artifacts/ci/hosted-audio-diagnosis/failed-jobs.log` and `download/acceptance-node-{22.12.0,24.21.0}/ci-next/next-run-diagnostic.json`; command matrices through the failure are in their `ci/acceptance-report.json` directories.

### 2. Hosted acceptance is incomplete — OPEN

This run did not reach the complete Chromium/Firefox/WebKit matrix, scope migration, Node export memory, native export memory or visible preview benchmark. Hosted release preparation was also skipped. The isolated Firefox diagnosis PASS is not equivalent to the complete matrix.

The earlier local acceptance after the neck correction completed all fifteen commands with PASS (`artifacts/final-acceptance/local/acceptance-report.json`, commit `1baab1c`). Targeted local metadata, Next and Firefox checks followed. No new complete local suite ran on `3c589a9`; local reports do not replace CI on that commit.

### 3. Historical preview intermittency on macOS — OPEN

One attempt dropped three frames with a 160.2 ms RAF interval; another reached a 30-second timeout during the third Play. The old timeout did not preserve enough state to establish the cause. Subsequent local runs passed three Plays of 480 draws with zero drops and 1.9 ms p95. Those results **do not explain** the intermittency. It is not attributed to Linux audio.

Retained evidence: `artifacts/ci/failed-preview`, `artifacts/ci/timeout-preview`, `artifacts/ci/preview-diagnosis.json`, plus current clock/audio/RAF/control/visibility instrumentation and timeout snapshots. If it recurs, retain state and reproduce only the affected benchmark. No criteria were relaxed.

## Confirmed causes and verified corrections

- **Head–torso connection:** a neck bridge was added to the generator and fixture, and both WebM outputs were regenerated. Frames 0/97/144/174/204/274/384/479 are connected; the 198-pixel check per frame passes and the negative control without the neck is detected. Images extracted from the corrected WebM: `artifacts/short/video-contact-sheet.png`; report: `artifacts/short/head-torso-report.json`.
- **Firefox runner without audio output:** the baseline captured frame 97, a zero clock and unresolved resume. After PulseAudio was configured with a virtual sink, the same isolated verifier advanced, exported and decoded the real short: PASS in both jobs. Before/after evidence: `ci-firefox-baseline`, `ci-audio`, `ci-firefox-audio` inside the current run download. This confirms the environment cause for that Firefox incident; it does not establish the Next or historical preview cause.
- **Different Next PNG:** A/B comparison confirmed that full Chromium matches the offline renderer exactly, while headless shell differs by 3041 pixels on Linux. The verifier uses the same full Chromium and preserves exact PNG equality. Evidence: `artifacts/ci/hosted-browser-diagnosis` and `artifacts/final-acceptance/hosted-next-cause.json`.
- **Checkout URL:** the verifier accepts equivalent forms of the actual remote with or without `.git` and rejects another repository. Evidence: `artifacts/final-acceptance/repository-regression.json`.

## Prepared packages and pending publication

The seven `@aether-fx/{core,compiler,canvas,react,export,node,cli}` packages at version 0.1.0 were rebuilt and packed on `3c589a9`. They are under `artifacts/release`, with `SHA256SUMS` and `manifest.json`. Library bytes did not change: the correction is in the generator/fixture, outside the tarballs. Identical hashes do not mean rebuilding was skipped.

Original work: Apache-2.0, exact NOTICE `Copyright 2026  Fer's`; third-party licenses and notices are preserved. Actual remote: [aether-fx-lang](https://github.com/ferxalbs/aether-fx-lang).

**Publication is blocked and intentionally pending:** authenticated identity `ferxalb` does not establish control of `@aether-fx`; an organization E404 establishes neither availability nor ownership. Scope/package permissions, bootstrap and trusted publisher/OIDC configuration remain unverified. `publicationReady=false`. Nothing was published to npm.

## Coverage limits

- Physical mobile devices, physical displays/speakers and their latency: unverified. CI's virtual sink covers automated execution only.
- Optional MP4: unverified; the locally accepted outputs are WebM VP9/Opus at 720p and 1080p, 480 frames/20 seconds, 960000 audio samples and maximum alignment error 0.0834 ms.
- Native browser exports retain the measured 648-sample Opus tail. FFmpeg's EOF diagnostic is retained alongside zero decoding errors; it was not used to modify criteria.
- The closure reports were left uncommitted to avoid triggering another CI run. The manifest identifies the base commit and local tree with closure documentation. Pre-existing unrelated files were not modified by that closure.

## What prevents v0 completion

The Next failure must be resolved or attributed with evidence, and hosted acceptance must complete on the corrected version. Historical intermittency remains an open risk. npm configuration is separately pending; preparing packages does not establish authorization or complete readiness to publish them.
