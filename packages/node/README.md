# @aether-fx/node

Experimental ESM adapter for explicit local assets and offline Chromium/FFmpeg export. Requires Node >=22.12, the matching Playwright Chromium installation, and external FFmpeg with libvpx-vp9 and libopus. No binary downloads run on package installation. Install Chromium deliberately with `npx playwright install chromium`, then use `doctor()` to check availability.

```js
import { loadProject, exportVideo } from '@aether-fx/node';
const loaded = await loadProject('scene.afx');
if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
const report = await exportVideo(loaded.value, {
  output: 'scene.webm', width: 1280, height: 720,
  signal: new AbortController().signal,
  onProgress: ({ frame, total }) => console.log(frame, total)
});
console.log(report);
```

`loadProject` returns syntax/semantic diagnostics in a Result; filesystem/environment failures throw `FxEnvironmentError`. Sources are limited to 2 MB. Assets resolve relative to the source directory, with realpath containment, SHA-256 manifests, and a 32 MB per-asset / 128 MB total default budget. No URL, absolute path, or symlink escape is accepted. Fonts are checked for a supported font signature, images for PNG/WebP metadata, and audio for complete PCM RIFF WAV metadata; the browser performs actual image/font/audio decoding before rendering.

`createOfflineRenderer(plan, assets, options)` offers `captureFrame`, `evaluateFrame`, and idempotent asynchronous `dispose`. Export uses the built Canvas renderer at exact output dimensions, a token-scoped loopback server, and an allowlist of browser requests. This is a controlled renderer for trusted local projects, not an OS-level sandbox for hostile Chromium input.

`exportVideo` requires even output dimensions, streams one PNG at a time into FFmpeg, and applies frame-derived audio trim, offset, gain, and padding. WebM VP9/Opus is the reference format; optional MP4 requires libx264/AAC and has not received the reference audiovisual acceptance gate. Cancellation and a default 300,000 ms timeout remove temporary files and close Chromium/FFmpeg. Destination publication uses a hard link on the destination filesystem and fails if the output exists; it never overwrites that file. A filesystem without hard-link support fails explicitly.

Reports include tool/OS versions, frame count, elapsed export factor, asset hashes, loaded font IDs, denied requests, queue capacity, and `peakRssBytes`. That memory field measures the Node coordinator only; it excludes Chromium and FFmpeg. Full pipeline memory is a separate acceptance measurement. Timeout includes environment checking, but a tool check already in progress completes under its own bounded process timeout before the export returns.

The package is under the repository's existing provisional ISC declaration. Final publication ownership and LICENSE metadata remain pending owner confirmation. Demo assets are not packaged here.
