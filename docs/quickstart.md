# Quickstart

AETHER Fx v0 is experimental and has not been published to npm. Use Node.js 22.12 or newer and npm. The recorded local reference is Node 24.21; Node 22.12 has also passed local package checks. Packages are ESM only. Scope/version come from `release.config.json`; this guide uses the intended `@aether-fx` / `0.1.0` configuration. The latest recorded hosted acceptance failed in Next playback; see [known issues](../KNOW-ISSUES.md) for current limits. This guide runs the existing demo and examples without requiring the full acceptance suite.

## Preview the included animation

From the repository root:

```sh
npm ci
npm run build
node examples/browser/serve.mjs
```

Open **http://127.0.0.1:3000** (or the URL printed by the server). The demo loads *The Little Light*, a 20-second illustrated animation. Click **Play** to start sound, **Pause** to stop, drag the timeline to seek, and use the speed selector. Stop the server with Ctrl-C.

Preview needs no FFmpeg or Playwright browser installation. Download WebM is enabled after native codec probes pass. The demo retains compressed output within a 64 MiB budget and discards partial output on cancellation; larger exports need a progressive random-access sink or the Node route below.

To write your own file, start with the [complete asset-free example](../README.md#what-the-language-looks-like) and [language guide](language-v0.md). The bundled demo UI assumes the reference short's 720p aspect ratio and 480-frame timeline; use the [Canvas API](api.md) for a player tailored to another project's dimensions or duration.

## Compile and evaluate a frame

Save the following as `curve-example.mjs` in the repository root, then run `node curve-example.mjs`. Compilation/evaluation needs neither Chromium nor FFmpeg.

<!-- verify:node -->
```js
import { readFile } from 'node:fs/promises';
import { compileSource } from '@aether-fx/compiler';
import { evaluate, frameTimestamp } from '@aether-fx/core';

const result = compileSource(await readFile('fixtures/curve.afx', 'utf8'));
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
const frame = evaluate(result.value, { frame: 97 });
console.log(JSON.stringify({ duration: result.value.duration, frame: frame.frame,
  shot: frame.shot, timestampUs: frameTimestamp(97, result.value.document.fps) }));
```

Expected output is `{"duration":480,"frame":97,"shot":"first","timestampUs":4041667}`. Frames are absolute integer indices; frame 480 is outside this movie. The illustrated short is `fixtures/short/little-light.afx`; it declares real font/image/audio assets and requires a resolved manifest, so use `loadProject` rather than compiling it with an empty manifest.

## Export through the CLI

Install FFmpeg with `libvpx-vp9` and `libopus` through your platform's package manager, then deliberately install the bundled Playwright version's Chromium. FFmpeg installation and codec availability are separate from npm installation.

```sh
npx playwright install chromium
node packages/cli/dist/afx.js doctor
node packages/cli/dist/afx.js check fixtures/short/little-light.afx
node packages/cli/dist/afx.js compile fixtures/short/little-light.afx --out plan.json
node packages/cli/dist/afx.js render fixtures/short/little-light.afx --out short.webm --width 1280 --height 720
```

Choose new output paths: compile/render reject existing files. Reference output is 20 seconds, 480 frames at 24 fps, VP9 video and stereo Opus. `doctor` must pass before export; missing executable/encoder diagnostics are explained in [Node export](node-export.md). Programmatic `loadProject`/`exportVideo` usage is in `examples/node/export.mjs`; its output path must also be new. Physical mobile and optional MP4 acceptance are unverified.

## Install local packages in another project

After `npm run build`, prepare the current build's archives:

```sh
node scripts/verify-package-metadata.mjs
```

From the repository root, create a fresh temporary consumer and install the exact seven archives together:

```sh
afx_archive_dir="$PWD/artifacts/metadata-packages"
afx_consumer_dir=$(mktemp -d)
cd "$afx_consumer_dir"
printf '{"private":true,"type":"module"}\n' > package.json
npm install \
  "$afx_archive_dir/aether-fx-core-0.1.0.tgz" \
  "$afx_archive_dir/aether-fx-compiler-0.1.0.tgz" \
  "$afx_archive_dir/aether-fx-canvas-0.1.0.tgz" \
  "$afx_archive_dir/aether-fx-react-0.1.0.tgz" \
  "$afx_archive_dir/aether-fx-export-0.1.0.tgz" \
  "$afx_archive_dir/aether-fx-node-0.1.0.tgz" \
  "$afx_archive_dir/aether-fx-cli-0.1.0.tgz"
```

Run `npx afx doctor` from that consumer after deliberately installing Chromium and FFmpeg. Return to the repository root for the verification commands below. Installing the complete set together lets npm satisfy internal exact versions without requiring unpublished registry packages. Runtime dependencies and the React peer are resolved normally; tarballs exclude demonstration assets and browser binaries. Copy your `.afx` and declared assets separately. Do not use `npm link` as release evidence.

The reproducible packaged-consumer checks are:

```sh
node scripts/verify-node-packages.mjs artifacts/metadata-packages
node scripts/verify-react-next.mjs artifacts/seven-package-next artifacts/metadata-packages
node scripts/verify-web-export.mjs artifacts/metadata-packages artifacts/seven-package-web
```

Each installs the exact hash-verified seven-archive set without workspace links. Their local reference evidence is summarized in `artifacts/seven-package-release/report.json`. These checks do not publish or prove npm scope ownership.

## Run the Next example

After building the root packages:

```sh
node scripts/prepare-next-example.mjs
npm --prefix examples/next-app run build
npm --prefix examples/next-app start
```

Preparation installs current real tarballs and copies the short/assets into the private example. It must run before the example's build or lockfile installation. The server compiles the project; only the serializable plan crosses to the client player. Wait for readiness before calling the imperative ref. See [React/Next integration](react-next.md) for complete component code, ownership and StrictMode behavior.

For authoring, read [the language guide](language-v0.md). For editing, decoding and ownership contracts, read [the API](api.md). For scope/version changes, archives, partial-publication recovery and external publisher prerequisites, read [release preparation](release.md). Local package checks and hosted acceptance have different results; consult [release readiness](../RELEASE-READINESS.md) for the latest recorded evidence. The packages remain unpublished.
