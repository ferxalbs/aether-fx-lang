# Node rendering and diagnosis

This page describes the current Node frame/encoder boundary. For the 0.2.0-rc.2 capabilities and retained failures, see [export-v0.1](export-v0.1.md).

For the latest recorded acceptance status and unresolved failures, see [release readiness](../RELEASE-READINESS.md) and [known issues](../KNOW-ISSUES.md). Local results below do not establish hosted CI success.

The default export runs the numeric Canvas renderer on Skia (@napi-rs/canvas), streams exact-sized RGBA frames sequentially to external FFmpeg with write backpressure. `backend: chromium` explicitly selects Playwright Chromium for compatibility. It uses neither screen recording nor MediaRecorder. Node does not import the browser renderer into its own execution context.

## Deliberate setup

```sh
npm ci
npm run build
# Only for backend: chromium
npx playwright install chromium
node packages/cli/dist/afx.js doctor
```

Install FFmpeg through your platform's package manager with `libvpx-vp9` and `libopus` enabled. `doctor` reports missing binaries/encoders without installing them. The current local reference is Node 24.21.0, Playwright 1.64.0 / Chromium 156.0.8078.4, and FFmpeg 8.0.1 on macOS 15.7.7 x86_64. A custom `ffmpegPath` or `chromiumExecutable` can be supplied to the Node API. The CLI uses the default configured installations.

```sh
node packages/cli/dist/afx.js check fixtures/short/little-light.afx
node packages/cli/dist/afx.js compile fixtures/short/little-light.afx --out plan.json
node packages/cli/dist/afx.js render fixtures/short/little-light.afx --out short.webm --width 1280 --height 720
node packages/cli/dist/afx.js render fixtures/short/little-light.afx --out short-1080.webm --width 1920 --height 1080
```

Outputs must not already exist. Quote paths with spaces. `--format mp4` is optional and needs libx264/AAC; MP4 remains outside the completed reference audiovisual check. `--timeout` is milliseconds, default 300000. SIGINT/SIGTERM cancel a render. JSON diagnostics go to stderr; successful reports go to stdout. The Node API example is in `examples/node/export.mjs`; browser preview runs with `node examples/browser/serve.mjs` at loopback port 3000.

## Asset ownership and trust

`loadProject` parses/normalizes the source and resolves assets relative to its directory. Realpath containment rejects symlink escapes and arbitrary URL/absolute paths. Source, file and aggregate byte budgets are enforced. Verified bytes and SHA-256 metadata are held for the render, so subsequent filesystem changes cannot substitute a different file in the current export. Browser loaders verify the manifest again and wait for real font, image and audio decoding. The original short declares a licensed Nunito font, original paper PNG and original stereo PCM WAV; provenance is in `fixtures/short/ASSETS.md`.

The ephemeral HTTP server serves only the source plan, built renderer, and declared bytes below an unguessable path. Browser routing allows those exact loopback endpoints and rejects other requests; a restrictive CSP and disabled service workers complement this. These controls do not create an OS-level sandbox. Run trusted local content with the permissions appropriate for Chromium and FFmpeg.

## Time, buffers and cleanup

Every output frame uses an absolute integer frame index. FFmpeg receives the rational frame rate, exact frame count and duration. Audio trimming/delay/padding uses rational frame-to-sample conversion. One PNG write must complete before the next capture; the coordinator never accumulates all output frames. Codec-internal buffers and fixed assets still consume memory.

Temporary files share the destination filesystem. A final hard link publishes the completed file atomically while refusing an existing destination. Failure, timeout and cancellation dispose the renderer (and close Chromium when selected), kill FFmpeg if necessary and remove the temporary directory. Calling renderer disposal more than once returns the same cleanup promise. If a filesystem cannot support the final hard link, export fails explicitly. `peakRssBytes` is the Node coordinator measurement; it is not total Chromium/FFmpeg memory and does not satisfy the full pipeline memory gate.

## Observed reference results

Both 720p and 1080p WebM outputs decode to 480 VP9 video frames and 960000 samples of 48 kHz stereo Opus audio: 20 seconds at 24 fps. Visual gold pulses occur at frames 24, 168 and 360 for three frames each. Decoded audio onset differences from the source are -0.0833, -0.0208 and -0.0208 ms. This measures encoded timing, not physical speaker/display latency.

Opus pre-skip is 312 samples; the muxed container reports 20.008 seconds while decoded audio and video content each last 20 seconds. FFmpeg 8.0.1 prints `Error parsing Opus packet header.` at the empty EOF flush. The retained debug log shows all packets decoded with zero errors and the correct sample count. The [FFmpeg n8.0 parser](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.0/libavcodec/opus/parser.c) calls duration parsing for complete frames without a nonempty-buffer guard; [upstream master](https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/libavcodec/opus/parser.c) contains that guard. Treating this as an EOF parser diagnostic is an inference from the source and observed log, not a claim that all future Opus errors can be ignored. Verification retains stderr and checks decoding independently.

## Reproduce the milestone checks

```sh
npm run check
node scripts/verify-resources.mjs
node scripts/inspect-short.mjs
node scripts/verify-node-lifecycle.mjs
node scripts/verify-node-packages.mjs
node scripts/verify-video.mjs short.webm short-1080.webm
```

The video verifier decodes actual files, counts frames/samples, samples the marker pixel at both resolutions, compares audio onsets, and retains FFmpeg diagnostics. The lifecycle verifier performs real short exports plus pre-abort, timeout, mid-render cancellation, host failure, output preservation and repeated disposal. Its process observation uses Unix `ps` and is currently local-host evidence. The current package verifier installs seven real tarballs without symlinks, checks exported declarations, compares all 480 isolated frame states, and runs the installed `afx` doctor/check/compile/render through paths containing spaces. The shared seven-archive Node/Next/browser distribution and reference memory/performance checks now pass locally; final hosted acceptance failed in Next playback and later gates did not run. Historical five-package reports retain their executed scope. See [the API reference](api.md), [quickstart](quickstart.md) and [current release gates](../RELEASE-READINESS.md).
