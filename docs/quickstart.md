# Quickstart

AETHER Fx 0.2.0-rc.2 is a local, unpublished candidate. Use Node 22.12 or newer. Historical measurements used Node 24.13.1; current checks use Node 24.21.0; hosted Linux acceptance is separate. Packages are ESM. Release metadata is defined in `release.config.json`.

## Preview the included animation

From the repository root:

```sh
npm ci
npm run build
node examples/browser/serve.mjs
```

Open **http://127.0.0.1:3000** (or the URL printed by the server). The demo loads *The Little Light*, a 20-second illustrated animation. Click **Play** to start sound, **Pause** to stop, drag the timeline to seek, and use the speed selector. Stop the server with Ctrl-C.

Preview needs no FFmpeg or Playwright browser installation. Download WebM is enabled after native codec probes pass. The demo retains compressed output within a 64 MiB budget and discards partial output on cancellation; larger exports need a progressive random-access sink or the Node route below.

To write your own file, start with the [complete asset-free example](../README.md#quickstart) and [language guide](language-v0.md). The bundled demo UI assumes the reference short's 720p aspect ratio and 480-frame timeline; use the [Canvas API](api.md) for a player tailored to another project's dimensions or duration.

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

Node export requires FFmpeg with libvpx-vp9/libopus. Install those prerequisites before rendering; `afx doctor` reports missing tools. MP4 additionally needs libx264/aac. Check actual codec support:

```sh
node packages/cli/dist/afx.js probe webm
node packages/cli/dist/afx.js render fixtures/short/little-light.afx --out short.webm
```

Choose a new output path. The reference output is 20 seconds, 480 frames at 24 fps, VP9/Opus. MP4 uses `--format mp4`. See [verified capabilities](export-v0.1.md); physical devices and Linux installation remain separate gates.

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
  "$afx_archive_dir/aether-fx-core-0.2.0-rc.3.tgz" \
  "$afx_archive_dir/aether-fx-compiler-0.2.0-rc.3.tgz" \
  "$afx_archive_dir/aether-fx-canvas-0.2.0-rc.3.tgz" \
  "$afx_archive_dir/aether-fx-react-0.2.0-rc.3.tgz" \
  "$afx_archive_dir/aether-fx-export-0.2.0-rc.3.tgz" \
  "$afx_archive_dir/aether-fx-node-0.2.0-rc.3.tgz" \
  "$afx_archive_dir/aether-fx-cli-0.2.0-rc.3.tgz"
```

Run `npx afx probe webm` from that consumer to test its actual external codecs. `afx doctor` diagnoses the Skia/external-FFmpeg path. Return to the repository root for the verification commands below. Installing the complete set together lets npm satisfy internal exact versions without requiring unpublished registry packages. Runtime dependencies and the React peer are resolved normally; tarballs exclude demonstration assets and browser binaries. Copy your `.afx` and declared assets separately. Do not use `npm link` as release evidence.

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

## Three commands in an empty consumer

Replace `/absolute/path/to/candidate` with the directory containing only the seven RC archives from the release manifest. Install FFmpeg as described above. From an empty directory:

```sh
npm install /absolute/path/to/candidate/*.tgz
printf 'project hello {viewport:(640,360);fps:(24,1);shape g {primitive:circle;radius:30;}part p {shape:@g;material:{fill:"#2563eb";};}actor a {parts:[@p];transform:{x:320;y:180;};}scene s {shot still {duration:2s;}}}' > hello.afx
npx afx render hello.afx --out hello.webm
```

The isolated quickstart check executes these installation/source/export steps without workspace links, then independently verifies the 48 video frames. This does not prove installation on other operating systems.
