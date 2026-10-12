# Experimental v0 API

All seven packages are ESM only, jointly versioned at `0.1.0` through `release.config.json`. CommonJS is unsupported. This API is experimental; incompatible changes require a new package version. The document/plan schema version is separately `1`. Shipped `.d.ts` files are the complete field-level type reference. Only the package root entry points and `@aether-fx/core/schema` are public exports; internal source paths are not API.

## Results, diagnostics and time

Validation and compilation return `Result<T>`: `{ ok: true, value: T }` or `{ ok: false, diagnostics: Diagnostic[] }`. Always narrow on `ok` before using `value`. Diagnostics have `code`, `severity`, `message` and optional `range`, `path`, `id`, `frame`, `interval`. Source offsets are zero-based UTF-16 indices with half-open `[start,end)` ranges; line/column are one-based. An EOF range can be empty. Canonical paths distinguish collections and shots; host manifest errors use `/manifest` paths without invented DSL ranges. Filesystem, renderer and export operations can reject/throw separately from validation results.

Timeline duration, keys and audio offsets/trims/durations use integer frames. Keys, morphs and exposures are local to their shot; `evaluate` and player seek use absolute movie frames. Valid frame indices are `[0, plan.duration)`. Rotation in the canonical model is radians, coordinates are project pixels, and FPS is `{ numerator, denominator }`. See [language semantics](language-v0.md) for boundary persistence and units.

## `@aether-fx/core`

Core has no parser, React, DOM, filesystem or implicit network access.

| Function | Contract |
| --- | --- |
| `checkSchema(value, kind, depth?)` | Structural diagnostics for `kind: 'document' \| 'plan' \| 'manifest'`; depth defaults to 64 |
| `validate(document, manifest?, limits?)` | Structural and semantic `Diagnostic[]`; does not build shot snapshots |
| `compile(document, manifest?, limits?)` | `Result<PlaybackPlan>`; clones and deeply freezes the validated document, manifest and snapshots |
| `evaluate(plan, { frame })` | Pure direct evaluation to a caller-owned `DrawList`; invalid frame throws `RangeError`. Changing its commands cannot change the plan |
| `serializeDocument(document)` | JSON string after structural checking; invalid structure throws `TypeError` |
| `deserializeDocument(json)` | `Result<FxDocument>` after JSON/structural checks; call `compile` for semantic validation and an immutable plan |
| `serializePlan(plan)` | JSON string after structural checking |
| `deserializePlan(json)` | Rebuilds from document/manifest; document, tracks and indices compare exactly. Computed snapshot numbers allow at most `32 * Number.EPSILON * max(1, abs(a), abs(b))` for engine roundoff. Returns the rebuilt immutable `Result<PlaybackPlan>` or `PLAN_INVALID` |
| `frameTimestamp(frame, fps, units?)` | Integer rational timestamp, default microseconds; nearest rounding with ties upward. Nonnegative frame and positive FPS/units must be safe integers; invalid/overflow values throw |
| `frameSeconds(frame, fps)` | Floating seconds, `frame * denominator / numerator`; use `frameTimestamp` for integer media timestamps |
| `ease(t, easing)` | Linear or cubic Bézier easing; endpoints/outside `[0,1]` return `t` |
| `multiply(a, b)` | Composition of two six-number Canvas affine matrices |
| `transformMatrix(transform, pivot?)` | Affine transform around pivot, default `[0,0]` |
| `topologyMatches(a, b)` | Ordered contour IDs, closure, cubic signed-area winding and segment IDs/counts must match |
| `interpolateShape(a, b, t)` | Numeric interpolation retaining semantic correspondence; topology mismatch throws |
| `diagnostic`, `success`, `failure` | Constructors for diagnostic/result values; `diagnostic` defaults severity to `error` |

Projected authoring is also available at the package root:

| Function | Contract |
| --- | --- |
| `orthographic(options?)` | Returns point/depth projection, viewer direction and scale; isometric defaults, radians, z up |
| `createSolid(id, recipe)` | Returns `{actor,parts,shapes,faces,errorBound}`; convex extrusion or bounded polygonal cylinder, ready to add to a document |
| `orderProjectedFaces(faces, projection?)` | Convex planar face-overlap/depth audit, at most 256 faces; returns order and split/layer diagnostics |
| `nodeContour(id, nodes, closed?)` | Identified nodes with relative corner/aligned/mirrored handles converted to cubic segments |
| `catmullRomContour(id, nodes, closed?)` | Centripetal Catmull–Rom converted to cubic segments, retaining repeated landmark IDs |
| `editContourNode(contour, nodeId, changes)` | Rebuilds a contour after a landmark/handle edit without mutating input |
| `rebuildContour(contour)` | Rebuilds controls from retained authoring; clone for an explicit cubic contour |
| `inverseMatrix(matrix)`, `matrixPoint(matrix, point)` | Affine inverse with singularity detection and point transformation |
| `contourArea(contour)` | Exact signed area of a closed cubic contour, including the close edge |

`SolidRecipe` stores dimensions, projection, top/light/dark materials, optional xyz anchors and pivot. Add all returned shapes and parts and the returned actor to the document. For dimensional edits call `createSolid` with the same ID and fixed sampling, replace that actor's generated assets, then compile: dangling references/topology changes must be repaired explicitly. `Actor.solid` and `Contour.authoring` survive JSON roundtrip; stale geometry/control data is rejected. A node edit can replace the contour with an ordinary atomic `applyPatch` update to its `contours` entry; incompatible morphs invalidate the patch. Constructors throw `RangeError` for invalid geometry. See [syntax and bounds](language-v0.1.md#public-projected-solids-editable-curves-and-contact).

`Material.fill` also accepts `Gradient` (linear/radial); `Part.clip` is a local shape ID and `Part.anchors` maps names to local xy points. `Shot.contacts` contains actor-to-part bind/release intervals with coincident local points. Contact binding preserves world pose, diagnoses singular matrices/shear and persists corrected transforms at shot boundaries. Evaluation remains stateless. `CurveNode`, `ProjectionOptions`, `SolidRecipe`, `ProjectedFace`, `Vec3`, `Gradient` and `Contact` are public types. The Canvas package exports `drawOverlays(canvas, drawList, document, options)` and `OverlayOptions` for optional nodes, anchors and layer labels; these diagnostics do not alter state or exports.

The core root exports model types `Vec2`, `Matrix`, `Fps`, `Transform`, `Segment`, `Contour`, `Shape`, `Material`, `AssetKind`, `Asset`, `ResolvedAsset`, `AssetManifest`, `Part`, `PartState`, `Pose`, `Drawing`, `Actor`, `Background`, `Property`, `Value`, `Easing`, `Key`, `Initial`, `Morph`, `Exposure`, `Camera`, `Shot`, `AudioTrack`, `FxDocument`, `Snapshot`, `PlannedShot`, `PlaybackPlan`, `DrawCommand`, `DrawList`, `Limits`, `Result`, `Diagnostic`, `SourceRange`, and patch types below. `SCHEMA_VERSION`, `IDENTITY` and `DEFAULT_LIMITS` are exported constants. Limits default to source 2,000,000 bytes, depth 64, parts 1,000, segments 100,000, tracks 10,000, resolution 8,192 and duration 1,000,000 frames; `Partial<Limits>` overrides are explicit host choices.

`applyPatch(document, patch, manifest?, { allowLockedAssetRevision? })` returns `Result<PatchResult>`. `DocumentPatch` contains `baseRevision` and 1–10,000 operations. `Collection` is assets/shapes/parts/poses/drawings/actors/backgrounds/shots. `PatchOperation` is `addNode { collection,node }`, `removeNode { collection,id }`, `updateProperty { collection,id,path,value }`, or `insertKey { shot,key }`, each with its `op` tag. Property paths are string arrays, not dot strings. IDs and prototype-related keys cannot be updated. The candidate is compiled before commit; failure leaves the input unchanged. Success increments revision once and reports `document`, `revision`, `affectedIds` and conservative `dependencies`. Locked-asset changes require explicit host authorization through the option and a consistent manifest.

<!-- verify:node -->
```js
import { readFile } from 'node:fs/promises';
import { compileSource } from '@aether-fx/compiler';
import { applyPatch, compile, deserializePlan, evaluate, serializePlan } from '@aether-fx/core';

const original = compileSource(await readFile('fixtures/curve.afx', 'utf8'));
if (!original.ok) throw new Error(JSON.stringify(original.diagnostics));
const patch = applyPatch(original.value.document, {
  baseRevision: original.value.document.revision,
  operations: [{ op: 'updateProperty', collection: 'actors', id: 'hero', path: ['layer'], value: 1 }]
});
if (!patch.ok) throw new Error(JSON.stringify(patch.diagnostics));
const edited = compile(patch.value.document);
if (!edited.ok) throw new Error(JSON.stringify(edited.diagnostics));
const restored = deserializePlan(serializePlan(edited.value));
if (!restored.ok) throw new Error(JSON.stringify(restored.diagnostics));
const frame = evaluate(restored.value, { frame: 97 });
console.log(JSON.stringify({ duration: restored.value.duration, shot: frame.shot,
  revision: restored.value.document.revision, layer: frame.commands[0].layer }));
```

## `@aether-fx/compiler`

`parse(source, { sourceBytes?, depth? })` returns `Result<DocumentAST>`. `normalize(ast)` returns `Result<FxDocument>` with contextual units/references converted to the canonical model. `print(ast)` produces normalized DSL text; comments and original whitespace are not preserved. `compileSource(source, manifest?, limits?)` combines parsing, normalization and compilation, retaining owning source ranges on diagnostics. The default manifest is empty, so asset-bearing projects need explicit resolved metadata. Parsing never executes embedded JavaScript. Public AST types are `AstValue`, `AstField`, `Declaration` and `DocumentAST`.

## `@aether-fx/canvas`

`createRenderer(canvas, resources?)` accepts `HTMLCanvasElement | OffscreenCanvas` and returns `Renderer { render(DrawList), dispose() }`. It scales project coordinates to backing dimensions, clears each frame and draws ordered cubic contours/text/images. It does not acquire or own the supplied asset resources. Missing Canvas 2D context or declared font/image throws; rendering after disposal throws.

`loadResources(plan, resolver, signal?)` returns `Promise<LoadedResources>`, with `images`, `fonts`, `audio` maps and idempotent `dispose()`. `AssetResolver` is `(asset: Asset, signal?: AbortSignal) => Promise<ArrayBuffer>`. The host decides how bytes are fetched. Loading verifies SHA-256 and decoded metadata, registers owned fonts, and releases partial results on failure/cancellation. Dispose removes those fonts, closes bitmaps and clears maps. It uses browser decoding APIs; it is not a Node asset loader.

`createPlayer(canvas: HTMLCanvasElement, plan, resources?)` returns `Player` and draws frame zero immediately. Resources default to empty image/font maps; real asset-bearing plans require loaded resources. The caller disposes resources after disposing the player. No playback `AudioContext` is created until `play()`; invoke it from a user gesture and handle rejection.

| Player method | Behavior |
| --- | --- |
| `play(): Promise<void>` | Starts/resumes playback; with audio, the AudioContext clock drives video |
| `pause()` | Stops scheduled playback/audio and draws the current frame |
| `seekFrame(frame)` | Direct absolute seek; integer frame must be inside the movie |
| `setPlaybackRate(rate)` | Positive finite rate, including audio playback rate |
| `getCurrentFrame()` | Current absolute integer frame |
| `getStats()` | Cumulative `droppedFrames` and `renderedFrames`, not physical display timing |
| `resize(width,height,dpr?)` | Positive finite CSS dimensions/DPR; backing dimensions cannot exceed 8192. DPR defaults to device DPR or 1 |
| `dispose()` | Idempotent cancellation, source disconnection, AudioContext close and renderer disposal; other methods then throw |

`CanvasResources`, `Renderer`, `AssetResolver`, `LoadedResources` and `Player` are public types. AudioContext closing is asynchronous even though `Player.dispose()` returns void. Native resource counters and sampled process memory are separate evidence; see [performance limits](performance.md).

## `@aether-fx/react`

`FxPlayer(props: FxPlayerProps)` is a client component with required `plan` and `resolveAsset`. Optional props are `ref?: Ref<Player>`, `className`, `style`, `ariaLabel`, `onReady` and `onError(error: Error)`. `Player` and `AssetResolver` types are re-exported. React is a peer dependency. SSR emits a canvas without asset loading or DOM effects. The component owns resources and player for each plan/resolver pair; replacing either releases the previous session. Keep those identities stable for UI updates. Wait for `onReady` before using playback controls. Ref `dispose()` also releases loading/resources; remount or replace plan/resolver to initialize again. See the [verified React/Next example](react-next.md).

## `@aether-fx/node`

`loadProject(path, { signal? })` returns `Promise<Result<LoadedProject>>`: `plan` plus `assets: ResolvedAssets { manifest, files }`, where each file has real `path` and `Buffer` bytes. DSL/schema failures are diagnostics; filesystem/format/cancellation failures can throw `FxEnvironmentError` with `code`. Asset paths resolve beneath the source directory, including realpath containment; URLs and escaping paths are rejected. The default source limit is 2 MB.

`resolveAssets(document, { root, signal?, maxAssetBytes?, maxTotalAssetBytes? })` resolves explicit local assets and computes manifest hashes/metadata. Defaults are 32 MB per asset and 128 MB total. `imageMetadata(Buffer)` reads supported PNG/WebP headers; `wavMetadata(Buffer)` validates integer PCM RIFF WAV and returns duration/sampleRate/channels/bits/dataOffset/dataLength. These metadata helpers do not substitute for full browser image/font decoding.

`doctor({ backend?, ffmpegPath?, chromiumExecutable? })` returns `Promise<Result<EnvironmentReport>>` containing FFmpeg version, executable Chromium path and vp9/opus/h264/aac encoder availability. Reference export requires `libvpx-vp9` and `libopus`. It checks executable availability, not every runtime launch condition.

`createOfflineRenderer(plan, assets, { width?, height?, signal?, chromiumExecutable? })` returns `Promise<OfflineRenderer>` with `captureFrame(frame): Promise<Buffer>` (PNG), `evaluateFrame(frame): Promise<DrawList>`, `browserVersion`, `blockedRequests`, and `dispose(): Promise<void>`. Dimensions default to project viewport and must be integers in `[1,8192]`. It rebuilds the plan and owns a token-scoped loopback server/browser; always await disposal in `finally`.

`exportVideo(project, options)` returns `Promise<ExportReport>`. Required option: `output`. Optional: `backend: native | chromium` (native default), `width`, `height`, `format: 'webm' | 'mp4'`, `signal`, `timeoutMs` (default 300,000), `ffmpegPath`, `chromiumExecutable`, and `onProgress({ frame,total })`. Output directory must exist; output must be new. WebM is the verified VP9/Opus reference; MP4 additionally requires libx264/aac and is verified separately by independent decode. Video dimensions are even integers accepted by the offline renderer. The exporter commits through a hard link without overwriting an existing file and cleans temporary output on failure/cancellation.

`ExportReport` records output, frames, width/height, content duration in seconds, elapsed seconds/exportFactor, tool/OS versions, asset hashes/fonts, one-frame queue capacity, blocked requests and coordinator-only `peakRssBytes`. `FxEnvironmentError`, `ResolvedAssets`, `LoadedProject`, `EnvironmentReport`, `OfflineRenderer`, `ExportOptions` and `ExportReport` are exported. See [Node export and diagnostics](node-export.md) for installation and actual process tests.

## `@aether-fx/export`

`queryWebExport(plan, { width?, height? })` returns `Promise<Result<WebExportCapability>>` after real native video/audio probes. Secure context, VP9 and (when present) Opus are required. Dimensions default to the viewport and must be even integers in `[2,8192]`. An unsupported query returns `EXPORT_UNSUPPORTED`; it does not touch a sink.

`exportWebM(plan, resources, options)` returns `Promise<WebExportReport>` or throws `WebExportError { code }`. Options require `sink` and optionally `width`, `height`, `signal`, `onProgress({ frame,total,bytesWritten })`. The host owns decoded resources until completion. `WebExportSink` supplies asynchronous `write(data: Uint8Array<ArrayBuffer>, position, signal?)`, `close()` and `abort(reason)`; writes require random access for header rewrites. Commit in close and discard/release pending writes in abort. The exporter cannot interrupt a host promise that ignores cancellation.

Reports include frames, dimensions, duration/elapsed seconds, bytes, codec configurations, submitted audioSamples and queue capacities (producer/video 1, audio 4). Already-aborted/unsupported exports do not acquire the sink; acquired sink failures/cancellation abort once. Public exports also include `WebExportOptions`, `WebExportCapability`, `WebExportReport`, `WebExportSink`, `WebExportError`. See [browser export](browser-export.md) for the measured Opus tail, progressive sink and capability limits.

## `@aether-fx/cli`

The package root re-exports `loadProject` and `doctor` from Node. The installed executable is `afx`; the internal `main` function is not a public root export.

```sh
afx doctor
afx check file.afx
afx compile file.afx --out plan.json
afx render file.afx --out video.webm --width 1280 --height 720 --format webm --timeout 300000
```

Commands report JSON. Success exits 0; validation/environment/render failures exit 1; missing/unknown command usage exits 2. Compile/render require a new output path. `--timeout` is milliseconds. Render handles SIGINT/SIGTERM through cancellation. Browser binaries and FFmpeg are deliberate external installations, not bundled npm files. See [quickstart](quickstart.md) and [release preparation](release.md).

## v0.1 authoring / 0.2.0-rc.1 additions

Compiler adds `expand(ast)`, `safeEdits(source)`, `applySafeEdits(source, expectedSource, edits)` and `authorDiagnostics(source, diagnostics)`. Expansion returns an AST; `normalize` yields schema-1 canonical data. Safe edits are UTF-16, nonoverlapping and expected-text checked. No source evaluation or I/O is introduced in core/compiler.

Node `createNativeRenderer(plan,assets,{width,height})` is a still-frame Skia renderer with owned font sessions and PNG/pixel capture. Video `exportVideo` defaults to Skia/external FFmpeg (`backend: native`); `backend: chromium` selects the explicit compatibility renderer. `doctor()` diagnoses required tools and encoders. Coordinator `peakRssBytes` differs from `afx bench` aggregate tree RSS.

Browser WebM stays at `@aether-fx/export`; import `exportMP4` from `@aether-fx/export/mp4`. `queryWebExport(plan,{format:'mp4'})` checks actual codecs. `exportWebVideo` at the default entry accepts WebM; use the MP4 entry for MP4 output. The optional `/aac` entry requires explicit installation of @mediabunny/aac-encoder 1.61.3. Keep host resources live until completion. Probes do not replace independent decode.

CLI additions: check --json, fix --safe, fmt [--write], expand, scene brief.json -o out.afx, probe webm|mp4, bench --out report.json [--repeat 1..3], hash with backend/format/resolution, and lsp. All output artifacts require new paths except an explicit formatter/safe-fix source write. `afx hash` is a content cache key, not a promise of cross-platform pixel identity. LSP uses full document sync, source diagnostics and formatting; it resolves only declared local asset bytes for file URIs.
