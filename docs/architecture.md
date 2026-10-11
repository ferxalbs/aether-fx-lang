# AETHER Fx architecture

`.afx source → AST → bounded expansion/normalization → FxDocument → immutable PlaybackPlan → evaluate({frame}) → owned DrawList → Canvas/Skia`

The seven packages isolate pure core semantics, compilation, rendering, React integration, browser encoding, Node adapters and CLI tooling. Core imports no browser, parser, Node or codec dependency. Expansion is compile-time, bounded and rejects cycles before allocating expanded instances. [Language](language-v0.1.md) and [API](api.md) describe supported authoring/contracts; [readiness](../RELEASE-READINESS.md) records technical limits.

Renderer and encoder are independent: the default server path uses Skia frame production and streamed external FFmpeg encoding; the opt-in integrated encoder reuses the same renderer. Chromium supplies an explicit compatibility/oracle path. Browser Canvas is an integration interface, not a language requirement. Native addons never belong in browser or Next client imports.

## Contracts resolved by this implementation

- Authoring source uses named declarations and typed property data. Chevrotain parses syntax; normalization rejects unknown declarations/properties and resolves units. No JavaScript expression grammar or execution exists.
- `Result<T>` is `{ ok: true, value } | { ok: false, diagnostics }`. Source failures carry zero-based, half-open UTF-16 offsets plus one-based line/column. Canonical JSON failures carry JSON paths; compile-source maps schema paths to the originating values and attaches affected declaration ranges for semantic failures. EOF uses the actual source end and numeric ranges include units.
- Canonical documents and plans use independent `schemaVersion: 1`. The exported JSON Schema is draft 2020-12. Validation never coerces types or inserts defaults into externally supplied JSON. DSL normalization inserts documented defaults.
- The schema evaluator supports exactly the JSON Schema constructs used by the exported schema. It is not a general-purpose schema library. Structural validation rejects nonfinite numbers, unknown properties, unsafe keys, cycles, nonplain objects and oversized nesting. The core contains no DOM, filesystem, networking or parser import.
- IDs are stable within their collection. Actor targets are `actor` and `actor.part`; `camera` is reserved. Contour IDs are local to a shape and segment IDs are local to a contour. Correspondence requires identical IDs, order, contour closure and segment counts, never geometric proximity.
- Every part has one content type: cubic shape, image or text. Geometry definitions and actor instances remain separate. Part parenting is static; actor parenting may switch at a discrete key to an `actor.part` anchor.
- All authored frame coordinates are shot-local, integer and nonnegative. Shots concatenate in declaration order. Source units include `f`, `s`, `ms`, `deg`, `rad`; canonical angles are radians. Timestamps and sample indices round each absolute rational index to nearest integer with ties up using BigInt intermediates.
- Part/actor defaults are defined initial values. A property holds its initial value before its first key; its last key persists. Numeric tracks interpolate; evaluated opacity clamps to [0,1] even when easing overshoots. Strings, booleans and null switch at the key boundary. A left key controls interpolation easing, rotation mode and sampling hold until the next key.
- Morph intervals are `[start,end)` with a destination state held from `end`. Explicit source/destination pose properties are required on both sides. Sequential morphs are ordered by start time; overlapping writers are errors. Discrete exposure overrides are temporary and return to the underlying drawing at `end`.
- Each shot receives a boundary snapshot of the preceding shot at local time `duration`, then applies explicit initial values. A morph ending exactly on that boundary reaches its destination. Camera framing is explicitly reset from each shot's camera declaration/default, while actor and part states carry forward.
- Composition is part local transform and pivot, ancestor parts, actor instance and anchor parent, inverse camera, then stable layer ordering. Camera scales must be positive and their easing cannot overshoot. Parallax scales camera translation per background actor.
- Plans are copied and recursively frozen. DrawLists own their arrays and geometry; consumers may retain them across asynchronous operations. There is no scratch lifetime hazard in this first implementation.
- Imported plans are structurally checked and recompiled from their documents and manifests. Supplied snapshots, durations or shot indices must equal the rebuilt plan. Key order in JSON objects is immaterial.
- Patches clone the document, apply all operations, validate and compile the candidate, then return a new revision. Failed operations never mutate the caller's document. Locked assets require an explicit host authorization option. Dependency reporting is conservative; recompilation is complete in v0.

## Rendering and verification

Browser Canvas and the Skia adapter consume the same numeric DrawList. Skia is the default Node video renderer; Chromium is explicit. External FFmpeg receives frames with awaited pipe writes. Browser WebM and optional MP4 entries share bounded sample/sink ownership; codecs are probed on the actual host. Renderers own their sessions, while explicitly supplied resources remain caller-owned.

Node asset resolution checks realpath containment, byte limits and content hashes. Browser/offline servers deny undeclared external requests. Cancellation/cleanup are tested runtime behaviors; schema validation does not isolate processes. The 480-frame curve fixture proves semantic regression, while the illustrated short supplies pixel/audio/decode and resource evidence. These are not interchangeable with model-generation evaluation.

Primary references: [Chevrotain](https://chevrotain.io/docs/tutorial/step1_lexing.html), [WebCodecs](https://www.w3.org/TR/webcodecs/), [Mediabunny](https://mediabunny.dev/guide/introduction), [Next server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components).
