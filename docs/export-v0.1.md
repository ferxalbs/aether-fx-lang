# Export capabilities and limits

Node `exportVideo(project,options)` defaults to Skia with external FFmpeg. It streams raw RGBA frames, awaits writes, preserves existing outputs, and releases browser/process/temp-file resources on success, cancellation or timeout. Use `doctor()` / `afx probe webm|mp4` before export. Installation and encoder requirements are in [Node export](node-export.md).

The integrated NodeAV/Mediabunny encoder remains available through `@aether-fx/node/integrated`, outside the default graph, with exact optional peers. Its binary redistribution is not qualified; see [licenses](licensing.md). Both Node encoders use the same Skia frame renderer. `backend:'chromium'` selects the browser compatibility renderer. Approximate parity was measured on eight reference frames; backend/font/platform pixels are not identical.

Browser WebM uses native VP9/Opus WebCodecs and Mediabunny. Import `exportMP4` from `@aether-fx/export/mp4` for AVC/AAC MP4; its muxer is outside the default WebM graph. The real encoder probes return `EXPORT_UNSUPPORTED` when unavailable. Native AAC capability success is not decode conformance: onset and metadata failures were observed on Chromium/WebKit.

For the existing optional WASM path, install `@mediabunny/aac-encoder@1.61.3` explicitly and import `exportMP4WithAacWasm` from `@aether-fx/export/aac`. The peer is optional and absent from the default install graph. This is FFmpeg AAC WASM, not FFmpeg-free. Preserve its upstream licenses/source requirements when bundling. See [licensing](licensing.md).

Output dimensions must be even and <=8192. Resources remain host-owned until completion. Sink writes support random-access headers; cancellation requires the host sink to settle pending writes. AAC priming/padding and Opus tails are reported separately. Independent decode establishes the measured frame/duration/audio contract; it does not establish aesthetics, every framerate or physical-device compatibility.

The restored integrated entry was smoke-tested on macOS x64 with 12 Skia frames, H.264/AAC and independent FFprobe decode. This demonstrates operation, not distribution compliance or a full platform matrix. Bun 1.4.2 was separately smoke-tested for native PNG rendering and a 12-frame external-FFmpeg MP4; full Bun lifecycle/platform compatibility remains unqualified. Node remains the reference runtime. Native modules stay in server entries; browser and Next client graphs must exclude them.

| Server route (same Skia renderer) | Functional evidence | Distribution / default |
| --- | --- | --- |
| Skia + Mediabunny/NodeAV integrated | Recovered opt-in entry; 12-frame H.264/AAC independent decode | Native binary terms/source correspondence unqualified; not default-installed |
| Skia + external FFmpeg | Streamed frames with backpressure; full 480-frame MP4/WebM, audio/timestamps and lifecycle checks | Recommended provisional default; binary installed separately with explicit codec requirements |
| Alternative FFmpeg build/backend | No replacement build qualified | Do not substitute without codec, installation and license evidence |

These are functional/distribution comparisons. Integrated VP9 uses a 4 Mb/s target with server realtime/cpu-used5 defaults; the production external path uses CRF30/deadline-good/cpu-used4/two threads. Their historical timing figures are not comparable at equivalent encoding quality and cannot establish a renderer speed improvement. Both consume frames from the same native renderer.
