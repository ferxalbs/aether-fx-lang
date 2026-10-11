# @aether-fx/node

Node >=22.12 ESM adapter for contained local assets, Skia rendering and streamed external FFmpeg video export. Install an external FFmpeg with libvpx-vp9/libopus. MP4 additionally requires libx264/aac. Neither executable is included in AETHER tarballs.

```js
import { loadProject, exportVideo, doctor } from '@aether-fx/node';
const environment = await doctor();
if (!environment.ok) throw new Error(JSON.stringify(environment.diagnostics));
const loaded = await loadProject('scene.afx');
if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
const report = await exportVideo(loaded.value, {output:'scene.webm'});
```

WebM VP9/Opus is default; `format:'mp4'` selects AVC/AAC. `backend: native` is default and uses `createNativeRenderer` (@napi-rs/canvas), with font ownership until all sessions close. `backend: chromium` uses `createOfflineRenderer` and additionally requires Playwright Chromium. The opt-in `/integrated` entry exports `nativeCapabilities` and `exportNativeVideo`; install its exact optional peers only after qualifying their binary distribution.

Local source/assets have size, signature, realpath and SHA256 checks. Remote/escaping paths fail. Video export streams frames with backpressure, releases processes/temp files on cancellation and refuses existing destinations. `peakRssBytes` is coordinator-only; `afx bench` samples the complete process tree. Backend state determinism does not guarantee cross-platform pixels.

Original code is Apache-2.0; exact LICENSE/NOTICE are included. Third-party dependencies retain their terms. No NodeAV/FFmpeg binary is packaged.
