# @aether-fx/export

Experimental browser WebM export using native WebCodecs and Mediabunny 1.61.3. The library imports no filesystem or FFmpeg code. Capability checks perform a real one-frame video and short silent-audio encode probe, then close their own frames/data/encoders. It checks the actual VP9 video and, when declared, Opus audio configurations and container compatibility before creating output. A secure browser context is required. Unsupported configurations return EXPORT_UNSUPPORTED from queryWebExport and throw that code from exportWebM, with Node export guidance; no recording fallback or empty file is generated.

```js
import { queryWebExport, exportWebM } from '@aether-fx/export';
const supported = await queryWebExport(plan, { width: 1280, height: 720 });
if (!supported.ok) throw new Error(JSON.stringify(supported.diagnostics));
const report = await exportWebM(plan, loadedResources, {
  sink, signal: controller.signal,
  onProgress: ({ frame, total }) => console.log(frame, total)
});
```

The host owns loaded fonts/images/audio; keep them live until export settles. Export owns a separate canvas, renderer, native sample wrappers and encoders. It evaluates absolute frames offline, interleaves frame-sized audio chunks with trim/offset/gain/silence, awaits encoder/writer backpressure and closes each sample. Video flushes one frame at a time; audio checks its actual native queue before submission and rechecks after every dequeue wakeup. There is one producer sample, at most one queued video sample and a native audio queue capacity of four. No collection of all video frames is retained. Fixed decoded assets, codec buffers, muxer clusters and the host sink still require memory.

A WebExportSink implements asynchronous write(data, position, signal), close() and abort(reason). Writes may overwrite header positions; use a random-access destination. Await write completion and copy bytes if retaining them after the call. close commits only after successful encoder/muxer finalization. abort must discard partial output and release/reject a pending write; the AbortSignal is supplied to writes. Unsupported or already-aborted exports do not acquire/touch the sink. A sink that ignores cancellation can delay cleanup indefinitely; the adapter cannot forcibly settle a host promise.

Browser availability is determined at runtime, not from the browser name. VP9/Opus support and secure context are mandatory for the configured project; silent projects do not require an audio encoder. Public query/report objects include the exact requested and actual encoder configurations. Output dimensions must be even integers no larger than 8192. Width/height scale the same project coordinates as the Canvas preview.

See the repository's browser export guide and release-readiness report for executed audiovisual, cancellation, packaging and browser capability evidence. Original code is licensed under Apache-2.0; LICENSE and NOTICE record the supplied ownership attribution. Demo assets and encoder binaries are not packaged.
