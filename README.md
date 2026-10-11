# AETHER Fx

Experimental typed 2D animation language and universal TypeScript runtime. The active v0 specification is [GOAL.md](GOAL.md). Implementation and verification are in progress; this repository is not release-ready.

```sh
npm ci
npm run verify:foundation
```

All seven package implementations are present. The illustrated acceptance short has twelve character parts, four poses, blink drawings, three background layers, hand/object contact, a licensed font, an original PNG and a real 20-second stereo WAV. Node exports contain 480 frames at 720p and 1080p with VP9/Opus; decoded audio markers match the source within 0.084 ms. The packaged React player passes production Next SSR/hydration/navigation and development StrictMode resource checks. Chromium, Firefox and WebKit pass desktop preview and native WebCodecs export with progressive writes and cancellation; browser Opus tail padding is measured separately. The full semantic corpus, pipeline memory/performance, final seven-package consumers and CI/release gates remain open. See the exact evidence and limits in release readiness.

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

See [React/Next integration](docs/react-next.md), [Node export and diagnosis](docs/node-export.md), [browser export and verification](docs/browser-export.md), [language](docs/language-v0.md), [architecture and investigation](docs/architecture.md), and [release readiness](RELEASE-READINESS.md) and [licensing/identity](docs/licensing.md). Packages are ESM only. Node 24.21 and Node 22.12 pass the current foundation checks locally; full-product CI verification remains pending. Browser assets resolve through an explicit host adapter. Public npm publication is outside this goal. Original code is licensed under Apache-2.0; see LICENSE and NOTICE. Third-party licenses remain intact.
