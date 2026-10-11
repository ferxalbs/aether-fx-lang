# AETHER Fx

**Write 2D animation as `.afx` source, play it on Canvas, and export it to video.**

AETHER Fx is an experimental declarative animation language with a TypeScript runtime. Define cubic shapes, character parts, poses and shots, then animate them with keyframes, morphs and drawing changes. The same compiled plan supports browser playback, React integration and offline rendering in Node.js.

![Frames from The Little Light, the included illustrated animation](assets/first-preview.png)

[*The Little Light*](fixtures/short/little-light.afx) is the included 20-second example: a character notices, reaches for and lifts a lantern. It combines layered backgrounds, hand/object parenting, facial animation, text and stereo audio. The image above is an earlier render; see [the example's history](docs/history-of-lang.md).

> Version 0.1.0 is experimental and unpublished. Use this checkout or local package archives. Local acceptance has passed, but the latest recorded hosted acceptance failed in Next playback; see [known issues](KNOW-ISSUES.md). The project is not release-ready.

## Try the animation

Use Node.js **22.12 or newer** and npm. From a cloned checkout:

```sh
npm ci
npm run build
node examples/browser/serve.mjs
```

Open **http://127.0.0.1:3000**. Click **Play** for sound, scrub the timeline or change playback speed. **Download WebM** becomes available when the browser passes the native codec probes. Stop the server with Ctrl-C.

Browser preview needs no FFmpeg or Playwright browser installation. For a complete walkthrough, including Node export and local archive installation, read the [quickstart](docs/quickstart.md).

## What the language looks like

This complete, asset-free project moves a stroked cubic curve from left to right over two seconds:

```afx
project hello {
  viewport: (640, 360);
  fps: (24, 1);

  shape curve {
    contour outline {
      start: (0, 0);
      closed: false;
      cubic arc { control1: (25, 40); control2: (75, 40); end: (100, 0); }
    }
  }
  part line {
    shape: @curve;
    material: { fill: null; stroke: "#2463eb"; strokeWidth: 6; };
  }
  actor mark { parts: [@line]; transform: { x: 100; y: 150; }; }
  scene movie {
    shot move {
      duration: 48f;
      key start { target: @mark; property: x; frame: 0f; value: 100; }
      key finish { target: @mark; property: x; frame: 47f; value: 400; }
    }
  }
}
```

Save it as `hello.afx` in the repository root, then validate it:

```sh
node packages/cli/dist/afx.js check hello.afx
```

Frames use the `f` suffix, references use `@`, and property values end with semicolons. Source describes animation data; it does not execute JavaScript. Continue with the [language guide](docs/language-v0.md) for poses, morphs, cameras and assets.

## Compile and inspect a frame

After building, save this as `inspect.mjs` in the repository root and run `node inspect.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { compileSource } from '@aether-fx/compiler';
import { evaluate } from '@aether-fx/core';

const result = compileSource(await readFile('fixtures/curve.afx', 'utf8'));
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));

const frame = evaluate(result.value, { frame: 97 });
console.log({ duration: result.value.duration, frame: frame.frame, shot: frame.shot });
// { duration: 480, frame: 97, shot: 'first' }
```

Evaluation uses an absolute frame index, so you can inspect frame 97 directly without playing the preceding frames. Projects with font, image or audio assets use `loadProject` from `@aether-fx/node` to resolve their manifest; see [Node rendering](docs/node-export.md).

## Export to video

Node export requires the matching Playwright Chromium and an external FFmpeg installation with `libvpx-vp9` and `libopus`. Install FFmpeg through your platform's package manager, then run:

```sh
npx playwright install chromium
node packages/cli/dist/afx.js doctor
node packages/cli/dist/afx.js render fixtures/short/little-light.afx --out short.webm --width 1280 --height 720
```

Use a new output path: the CLI refuses to overwrite an existing file. The reference output is WebM with VP9 video and Opus audio, 480 frames at 24 fps. See [Node export and troubleshooting](docs/node-export.md) or [browser export](docs/browser-export.md).

## Use the packages

The repository contains seven ESM packages. They are not yet available through a public npm release; [install local archives](docs/quickstart.md#install-local-packages-in-another-project) to use them outside this checkout.

| Package | Use it for |
| --- | --- |
| `@aether-fx/compiler` | Parse and compile `.afx` source with diagnostics |
| `@aether-fx/core` | Validate documents, evaluate frames, serialize plans and apply structured edits |
| `@aether-fx/canvas` | Render and play a plan in a browser |
| `@aether-fx/react` | Embed `FxPlayer` in React or Next.js |
| `@aether-fx/export` | Export WebM with native browser WebCodecs |
| `@aether-fx/node` | Load local assets and export through Chromium/FFmpeg |
| `@aether-fx/cli` | Run `afx doctor`, `check`, `compile` and `render` |

AETHER Fx fits projects that need text-authored 2D shapes, explicit morph correspondence and direct frame evaluation. Authoring happens in source files; the current demo previews those files. There is no visual editor or live source playground. General 3D, physics, arbitrary SVG import and Lottie interchange are outside v0. Browser export depends on actual codec support; physical mobile and optional MP4 acceptance remain unverified.

## Documentation

Start with the [documentation index](docs/README.md), or go directly to:

- [Quickstart](docs/quickstart.md): preview, inspect a frame and export.
- [Language guide](docs/language-v0.md): syntax and animation semantics.
- [API reference](docs/api.md): public exports and ownership contracts.
- [React and Next.js](docs/react-next.md): server compilation and client playback.
- [Known issues](KNOW-ISSUES.md): current failures and limitations.

## Develop

```sh
npm run check  # Release metadata consistency, build, typecheck and unit tests
npm run lint   # JS/TS syntax and JSON checks
```

Rendering and full acceptance checks have additional browser/FFmpeg requirements. See [architecture](docs/architecture.md), [performance measurements](docs/performance.md) and [release preparation](docs/release.md). Current release evidence lives in [RELEASE-READINESS.md](RELEASE-READINESS.md).

## License

Original code is licensed under [Apache-2.0](LICENSE). See [NOTICE](NOTICE), [asset provenance](fixtures/short/ASSETS.md) and [licensing details](docs/licensing.md) for attribution and third-party licenses.
