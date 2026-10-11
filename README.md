# AETHER Fx

Experimental typed 2D animation language and universal TypeScript runtime. The active v0 specification is [GOAL.md](GOAL.md). Implementation and verification are in progress; this repository is not release-ready.

```sh
npm ci
npm run verify:foundation
```

The current core/compiler packages compile a three-shot, 480-frame `.afx` semantic fixture, evaluate any frame directly, serialize documents/plans, validate geometry and references, and apply atomic structured edits. The three foundation tarballs also pass isolated Node/type/browser consumers and Chromium geometry, seek, DPR and disposal checks. Real resource/audio and full-product acceptance gates remain open.

```js
import { readFile } from 'node:fs/promises';
import { compileSource } from '@aether-fx/compiler';
import { evaluate } from '@aether-fx/core';
const result = compileSource(await readFile('fixtures/curve.afx', 'utf8'));
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
console.log(evaluate(result.value, { frame: 97 }));
```

See [language](docs/language-v0.md), [architecture and investigation](docs/architecture.md), and [release readiness](RELEASE-READINESS.md). Packages are ESM only. Node 24.21 and Node 22.12 pass the current foundation checks locally; full-product CI verification remains pending. Browser assets resolve through an explicit host adapter. Public npm publication is outside this goal. The inherited ISC declaration remains provisional pending owner confirmation.
