# AETHER Fx

Experimental typed 2D animation language and universal TypeScript runtime. The active v0 specification is [GOAL.md](GOAL.md). Implementation and verification are in progress; this repository is not release-ready.

```sh
npm ci
npm run verify:foundation
```

All seven package implementations are present. The illustrated acceptance short has twelve character parts, four poses, blink drawings, three background layers, hand/object contact, a licensed font, an original PNG and a real 20-second stereo WAV. Node exports contain 480 frames at 720p and 1080p with VP9/Opus; decoded audio markers match the source within 0.084 ms. The packaged React player passes production Next SSR/hydration/navigation and development StrictMode resource checks. Chromium, Firefox and WebKit pass desktop preview and native WebCodecs export with progressive writes and cancellation; browser Opus tail padding is measured separately. Semantic diagnostics preserve collection/shot ownership, and real Canvas crossing/occlusion regressions pass. Local visible preview meets frame p95 at 1.90 ms; Node and native browser export memory are measured at 20s/60s. See [performance evidence and limits](docs/performance.md). Seven shared-set archive imports/types/CLI consumers pass on Node 24 and 22, and attribution is confirmed. The same seven archives also pass production Next/StrictMode and three-engine browser preview/export consumers. The API reference and local-package quickstart are documented; CI/release gates remain open.

```js
import { readFile } from 'node:fs/promises';
import { compileSource } from '@aether-fx/compiler';
import { evaluate } from '@aether-fx/core';
const result = compileSource(await readFile('fixtures/curve.afx', 'utf8'));
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
console.log(evaluate(result.value, { frame: 97 }));
```

Preview and reference export:

```sh
npm run build
npx playwright install chromium
node examples/browser/serve.mjs
# Requires external FFmpeg with libvpx-vp9 and libopus:
node packages/cli/dist/afx.js doctor
node packages/cli/dist/afx.js render fixtures/short/little-light.afx --out short.webm
```

Start with [the local-package quickstart](docs/quickstart.md) and [experimental API reference](docs/api.md). See [React/Next integration](docs/react-next.md), [Node export and diagnosis](docs/node-export.md), [browser export and verification](docs/browser-export.md), [language](docs/language-v0.md), [architecture and investigation](docs/architecture.md), [release readiness](RELEASE-READINESS.md), [licensing/identity](docs/licensing.md) and [release configuration/preparation](docs/release.md). Packages are ESM only. Node 24.21 and Node 22.12 pass the current foundation checks locally; full-product CI verification remains pending. Browser assets resolve through an explicit host adapter. Public npm publication is outside this goal. Original code is licensed under Apache-2.0; see LICENSE and NOTICE. Third-party licenses remain intact.
