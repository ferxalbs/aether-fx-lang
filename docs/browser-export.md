# Browser preview and export

`@aether-fx/export` exports an absolute-frame PlaybackPlan to VP9/Opus WebM using native WebCodecs and Mediabunny 1.61.3. It imports in Node without touching browser globals; exporting requires a secure browser context. It imports no filesystem, FFmpeg or Playwright code. There is no MediaRecorder fallback.

```js
import { queryWebExport, exportWebM } from '@aether-fx/export';

const capability = await queryWebExport(plan, { width: 1280, height: 720 });
if (!capability.ok) throw new Error(JSON.stringify(capability.diagnostics));
const report = await exportWebM(plan, resources, {
  width: 1280, height: 720, sink, signal: controller.signal,
  onProgress: ({ frame, total }) => console.log(frame, total)
});
```

Load assets through `@aether-fx/canvas`'s explicit resolver. The caller owns those resources and keeps them available until export settles. Export owns and disposes its canvas, renderer, native encoders and sample wrappers. It validates/rebuilds the serialized plan before encoding. It produces frame timestamps from absolute rational indices and audio from absolute sample indices, applying trim, offset, gain and silence outside the declared track.

The capability query checks the exact native configuration and WebM codec compatibility, then performs actual one-frame video and short audio encode probes. Every probe closes its samples and encoders. Resolution must be even integers from 2 to 8192. The default is the project's viewport; 720p VP9 uses 3 Mbps and 1080p 6.75 Mbps, with variable bitrate and quality latency mode. Opus uses the manifest's sample rate/channels and 128 kbps. A project without audio requires only the video capability. A successful query describes this device and configuration, not every browser bearing the same name. Missing capabilities return `EXPORT_UNSUPPORTED` with Node export guidance before touching the sink.

The host sink supplies asynchronous `write(data, position, signal)`, `close()` and `abort(reason)`. WebM finalization rewrites headers: the destination must support byte-position writes. Await each write, and copy the bytes if retaining them. Commit the destination only in `close`; `abort` discards partial output and rejects/releases any pending write. The supplied signal allows prompt interruption. The library cannot settle a host promise that ignores cancellation. Already-aborted exports do not acquire the sink. After acquisition, cancellation and encoder/muxer/write failures abort it once and release owned native resources.

Video flushes one frame at a time, making callback timestamps unambiguous and bounding the native video queue to one. Audio checks `encodeQueueSize` against four in a loop, rechecking after each dequeue event. Each raw sample wrapper closes immediately after submission. Encoded packet writes are serialized and awaited; no array of all rendered frames is retained. Fixed decoded assets, codec internal buffers, muxer clusters and host sink storage are additional memory. Queue counters establish ownership/backpressure, not the full-process memory gate.

The example's Download WebM button uses a 64 MiB budget for retained compressed writes and assembles a Blob after finalization. It supports cancellation and discards partial writes. Use a progressive random-access file adapter for larger projects; Blob assembly and compressed storage belong to the example, not to the exporter queue bound.

## Executed desktop matrix

The local macOS 15.7.7 x86_64 matrix uses Node 24.21.0 and Playwright 1.64.0. Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2 all passed real font/PNG/WAV preview, gesture audio, play/pause/direct seek, and all 480 shuffled numeric frame states against Node with absolute tolerance 1e-9. Frame 97 screenshots are retained. This is Playwright desktop evidence; physical mobile and full platform support remain unverified.

All three engines actually encoded the complete 720p short; Chromium also encoded 1080p and the example's download. Random-access progressive writes start before the last frame. Success, pre-abort, progress cancellation, sink failure and cancellation during a pending write leave no open native encoders or sample wrappers. Observed maximum encoder queues were one video and one audio sample. The configured audio capacity remains four.

Independent FFmpeg decoding verifies VP9/Opus, 480 video frames at 24 fps, every absolute packet timestamp within Matroska's 1 ms precision, exact visual flashes at frames 24/168/360 and source/decoded audio onset differences below one frame. Browser files decode 960648 samples: 960000 source samples plus 648 samples (13.5 ms) of Opus tail padding. OpusHead declares 312 samples of pre-skip even where ffprobe's `initial_padding` field reports zero. Container duration varies by engine; see the report rather than treating container duration as content duration. The Node reference retains its stricter exact 960000 decoded samples, with FFmpeg discarding the tail. FFmpeg 8.0.1's investigated empty-EOF Opus parser diagnostic is retained; complete decode logs report zero errors.

```sh
npx playwright install chromium firefox webkit
npm run verify:web
```

The current standalone verifier packs all seven real tarballs, installs them without symlinks in a temporary consumer, checks public types and Node imports, and audits the browser dependency graph. It uses actual assets/encoders and random-access file writes, then invokes `verify-video.mjs --web` on every successful output, including the demo download. `artifacts/web-export/report.json`, `video-report.json`, `SHA256SUMS`, browser bundle inputs, screenshots and WebM files contain the evidence. The earlier four-package reports remain historical milestone evidence. The native counters retain closed encoder references intentionally and must not be used for heap benchmarking.

## Shared release archive set

```sh
node scripts/verify-web-export.mjs artifacts/metadata-packages artifacts/seven-package-web
```

This mode verifies the complete metadata-checked seven-package set and each SHA-256 before installation, then runs the same real preview/export/lifetime checks without repacking. The current shared-set run passes Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2, including all 480 shuffled states per engine, complete 720p exports, Chromium 1080p/demo download and cancellation/write-failure cleanup. The separate `artifacts/seven-package-web/video-report.json` verifies all five outputs with 480 frames, 648-sample Opus tail, largest absolute audio-marker error 0.08333 ms and zero decode errors; the known EOF diagnostic is retained. Reports, WebM files, screenshots, dependency graph and archive checksums stay together in that directory. Physical mobile, CI and publication remain separate.

Implementation decisions follow [WebCodecs](https://www.w3.org/TR/webcodecs/), [Mediabunny output](https://mediabunny.dev/guide/writing-media-files), [media sources](https://mediabunny.dev/guide/media-sources) and [codec/container support](https://mediabunny.dev/guide/supported-formats-and-codecs). During integration, the installed SDK's video sample queue admitted more than four pending samples after a dequeue wakeup, and its Firefox video capability probe retained an open encoder. Owned native probes and explicit native queue control address those observed lifetime/bound failures while retaining Mediabunny's encoded-packet muxer; no SDK source patch or second export implementation is kept.
