# AETHER Fx v0 architecture and investigation

Reviewed 2026-10-10. The original request remains in `AETHER-Fx-v0-GOAL.md`; `GOAL.md` is the working acceptance specification. This document records implementation decisions, not a claim that v0 is complete.

## Repository baseline

The repository started with an uncommitted goal document, package manifest, lockfile and TypeScript installation. There were no implementation files, tests, Git commits or Git remote. The referenced `lenguaje-nativo-animacion-investigacion.md` is absent. Preserve the original goal and do not infer the missing research's contents. The manifest declared ISC; do not silently replace it with Apache-2.0. Confirm the license and copyright owner before public release.

## Verified local tools

| Tool | Observed value | Evidence |
| --- | --- | --- |
| Node | 24.21.0 | `node --version` |
| npm | 11.19.0 | `npm --version` |
| OS | macOS 15.7.7, Darwin x86_64 | `sw_vers`, `uname -sm` |
| TypeScript | 7.0.2 | existing installation, npm metadata |
| Chevrotain | 13.2.0; Node >=22 | npm metadata; official lexer/parser docs |
| Vitest | 5.0.3; Node ^22.12 or ^24 or >=26 | npm metadata |
| esbuild | 0.28.2; Node >=18 | npm metadata |
| Playwright | 1.64.0; Node >=20 | npm metadata |
| Mediabunny | 1.61.3 available | npm metadata; integration not yet installed or verified |
| Proposed Next/React | Next 16.4.0 / React 19.3.0 available | npm metadata; integration not yet installed or verified |
| FFmpeg | libvpx-vp9 and libopus available | `ffmpeg -hide_banner -encoders` |

Pin dependencies exactly and use the lockfile. The initial engine floor is Node >=22.12.0 because of the development toolchain; the foundation tests and isolated consumers have now also passed locally on Node 22.12.0. Full-product Node 22 CI remains an open gate before claiming complete v0 support. Available versions do not establish integration compatibility.

## Contracts resolved by this implementation

- Authoring source uses named declarations and typed property data. Chevrotain parses syntax; normalization rejects unknown declarations/properties and resolves units. No JavaScript expression grammar or execution exists.
- `Result<T>` is `{ ok: true, value } | { ok: false, diagnostics }`. Source failures carry zero-based, half-open UTF-16 offsets plus one-based line/column. Canonical JSON failures carry JSON paths; compile-source attaches the affected declaration range.
- Canonical documents and plans use independent `schemaVersion: 1`. The exported JSON Schema is draft 2020-12. Validation never coerces types or inserts defaults into externally supplied JSON. DSL normalization inserts documented defaults.
- The schema evaluator supports exactly the JSON Schema constructs used by the exported schema. It is not a general-purpose schema library. Structural validation rejects nonfinite numbers, unknown properties, unsafe keys, cycles, nonplain objects and oversized nesting. The core contains no DOM, filesystem, networking or parser import.
- IDs are stable within their collection. Actor targets are `actor` and `actor.part`; `camera` is reserved. Contour IDs are local to a shape and segment IDs are local to a contour. Correspondence requires identical IDs, order, contour closure and segment counts, never geometric proximity.
- Every part has one content type: cubic shape, image or text. Geometry definitions and actor instances remain separate. Part parenting is static; actor parenting may switch at a discrete key to an `actor.part` anchor.
- All authored frame coordinates are shot-local, integer and nonnegative. Shots concatenate in declaration order. Source units are `f`, `deg`, `rad`; canonical angles are radians. Timestamps and sample indices round each absolute rational index to nearest integer with ties up using BigInt intermediates.
- Part/actor defaults are defined initial values. A property holds its initial value before its first key; its last key persists. Numeric tracks interpolate; evaluated opacity clamps to [0,1] even when easing overshoots. Strings, booleans and null switch at the key boundary. A left key controls interpolation easing, rotation mode and sampling hold until the next key.
- Morph intervals are `[start,end)` with a destination state held from `end`. Explicit source/destination pose properties are required on both sides. Sequential morphs are ordered by start time; overlapping writers are errors. Discrete exposure overrides are temporary and return to the underlying drawing at `end`.
- Each shot receives a boundary snapshot of the preceding shot at local time `duration`, then applies explicit initial values. A morph ending exactly on that boundary reaches its destination. Camera framing is explicitly reset from each shot's camera declaration/default, while actor and part states carry forward.
- Composition is part local transform and pivot, ancestor parts, actor instance and anchor parent, inverse camera, then stable layer ordering. Camera scales must be positive and their easing cannot overshoot. Parallax scales camera translation per background actor.
- Plans are copied and recursively frozen. DrawLists own their arrays and geometry; consumers may retain them across asynchronous operations. There is no scratch lifetime hazard in this first implementation.
- Imported plans are structurally checked and recompiled from their documents and manifests. Supplied snapshots, durations or shot indices must equal the rebuilt plan. Key order in JSON objects is immaterial.
- Patches clone the document, apply all operations, validate and compile the candidate, then return a new revision. Failed operations never mutate the caller's document. Locked assets require an explicit host authorization option. Dependency reporting is conservative; recompilation is complete in v0.

## Review findings and remaining investigation

The goal's matrices and performance targets were proposals, not measured results. The earlier research file, license owner, npm scope ownership, repository URL, actual trusted publisher settings and physical mobile testing remain unknown. These do not prevent local implementation, but public release cannot claim them as verified.

The player, resource resolver, browser export and Node export must test cancellation/cleanup as runtime behaviors. A schema validator cannot isolate Chromium. Node reference export must deny external requests, serve an allowlisted local resource set and invoke FFmpeg with separate arguments. Web export must query actual VP9/Opus configurations and return `EXPORT_UNSUPPORTED` when missing; no recording fallback.

The 480-frame curve fixture is a deterministic semantic regression fixture. It is not the required illustrated short and cannot count as visual, audiovisual, memory or performance acceptance evidence. Full end-to-end evidence must come from actual rendered images, a decoded video, audio markers and isolated tarball consumers.

## Primary references consulted

- [Chevrotain lexer tutorial](https://chevrotain.io/docs/tutorial/step1_lexing.html) and [parser tutorial](https://chevrotain.io/docs/tutorial/step2_parsing.html): runtime grammar and JavaScript parser architecture.
- [Next.js server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components): library entry points must preserve `use client`; server-to-client data must be serializable.
- [Playwright Library](https://playwright.dev/docs/library): browser launch, contexts and explicit browser installation/cleanup.
- [Mediabunny formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs): container support differs from actual device encodability; query real configurations.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/): npm >=11.5.1 and Node >=22.14.0; configuration belongs to an existing package's settings. Release workflow tools must satisfy this floor separately from runtime engines.
- [Canvas cubic curves](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/bezierCurveTo) and [FontFace construction](https://developer.mozilla.org/en-US/docs/Web/API/FontFace/FontFace): numeric rendering and explicit font preparation.
