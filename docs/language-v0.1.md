# AETHER Fx syntax v0.1

Package candidate: 0.2.0-rc.1, following the existing 0.1.0 package identity. Canonical document/plan schema remains 1. Primitive/reuse/time syntax normalizes to existing contours, IDs and integer frames. Easing is an additive schema extension; all old documents remain valid. There is no incompatible migration and therefore no `afx migrate` command. New easing values require this runtime; older schema-1 validators may reject those new values.

The normative compact specification is [the authoring pack](llm/reference.md), supplemented by [v0 semantics](language-v0.md). Twelve complete sources and the structural GBNF live alongside it. The parser accepts identifiers as contextual enum values, arbitrary declarations structurally and Unicode whitespace; semantic normalization restricts those forms. GBNF is a syntax constraint and cannot enforce references, budgets or timeline intervals.

Primitives use local-origin rectangles/rounded rectangles, centered circles/ellipses, open lines and closed polygons/stars. Rectangles contain four cubic lines; rounded rectangles contain four lines and four arcs. Ellipses contain four <=90° cubic approximations, not exact conics. SVG M/L/H/V/C/S/Q/T/A/Z commands support relative forms, repeated coordinates, quadratic-to-cubic conversion, smooth control reflection and endpoint arc flags/radius correction. Paths reject invalid/unknown commands and nonfinite values. SVG contours are outline0, outline1; other primitives use outline. Segments are s0, s1 in authored traversal. Elliptical arc subdivision changes topology when its quadrant count changes; morph correspondence is never inferred. Limit 10000 generated segments/1000 contours per primitive path.

Seconds/milliseconds retain numeric lexemes and convert by BigInt rationals. Rounding: nearest integer, ties away from zero. Absolute conversion is not accumulated floating point. An anchor's independently rounded offset is added in frame space; a repeat's stagger is multiplied rationally by its index before rounding. Negative or out-of-range final times fail canonical validation. Key frames must be less than shot duration, interval ends may equal it. Anchors including unused ones are cycle-checked before replacement, with depth 32.

Components/instances/repeats are compile-time AST substitution. Defaults are the params object; unknown arguments fail. Constants/themes have no expressions. Local definitions are prefixed; external asset references remain external. Cycle checks traverse all definitions before expanding, even unused definitions. Expansion is bounded by 1000 instances, depth 32, 20000 declarations and 100000 substituted AST values, in addition to parser/canonical limits. `@index` is an integer scalar in repeat; there is no arithmetic or string interpolation. Stagger applies to key/morph/exposure times and anchor at-times in each repeated subtree. Nested time shifts are added; final duplicate keys or overlaps still fail validation.

Easing names and the analytic spring domain/equations are documented in the pack. Camera scale rejects back/spring or overshooting Bézier. Opacity is clamped. Endpoints are exact; spring's physical initial velocity is divided by its terminal response under endpoint normalization. No previous frame, integration clock or hidden RNG is involved.

`afx fmt` prints the AST in deterministic format; comments are omitted. It does not perform semantic fixes. `expand` prints canonical JSON with normal defaults; `compile` produces a validated plan and real asset hashes. JSON diagnostics contain stable codes, severity, source range, canonicalPath and known expected/found data. Safe edits only insert a missing semicolon when the resulting source parses; `fix --safe` checks source identity, rejects overlaps/stale ranges, then revalidates syntax/semantics/assets. It does not guess units, names or animation intent.

The reference short's 480 states were compared against the baseline compiler/evaluator; geometry/artwork was not changed. Pixel parity has a measured tolerance for native versus Chromium and no cross-platform exactness promise. See release evidence for source/tool hashes. Linear/radial fills and local vector clips use the bounded contracts below. General shadows, blend modes and text layout/reveal remain outside this syntax.

## Public projected solids, editable curves and contact

These are additive schema-1 fields. Older runtimes may reject them. Projection is baked at authoring time; playback and the shot camera still operate in 2D at absolute frames. There is no arbitrary 3D camera orbit.

```afx
solid bracket {
  kind: extrude; height: 12;
  ring: [{id:a;point:(0,0);}, {id:b;point:(80,0);},
         {id:c;point:(80,30);}, {id:d;point:(0,30);}];
  projection: {preset:isometric;scale:1.5;};
  materials: {top:"#ced8d6";light:"#98adaa";dark:"#536f73";};
  anchors: {socket:(40,15,12);};
  transform: {x:240;y:180;}; layer:10;
}
solid pin {
  kind:cylinder;radius:8;height:32;steps:48;tolerance:0.1;
  materials:{top:"#ced8d6";light:"#98adaa";dark:"#536f73";};
}
shape outline {
  contour edge {
    closed:false;
    node heel {point:(0,0);out:(20,0);mode:mirrored;}
    node elbow {point:(50,30);in:(-12,0);out:(18,0);mode:aligned;}
    node tip {point:(90,0);in:(-20,0);mode:corner;}
  }
}
shape organic {
  contour edge {
    curve:catmull-rom;closed:false;
    node heel {point:(0,0);}
    node elbow {point:(50,30);}
    node tip {point:(90,0);}
  }
}
```

A `solid` generates an actor, visible face parts and cubic shapes. `bracket_top` and `bracket_side_a` are persistent face IDs, with `_shape` on shape IDs. Face indices occupy layers 0..1 relative to the solid actor; cylinder paint bands occupy -0.1. Part/actor placement uses ordinary transforms. `pivot` is shared by generated parts; spatial anchors are projected into the cap part's local coordinates. `parent:@other.other_top` attaches a solid to an existing part. Within components, generated references such as `@post.post_top` expand to the instance-prefixed actor and face IDs. Components supply dimensions and repeats supply details using the existing substitution mechanism, without new expression evaluation.

An extrusion accepts a **strictly convex simple xy ring**, with either winding, a positive height and optional z. Concave/crossing rings require convex pieces with explicit layers and diagnose `OCCLUSION_SPLIT_REQUIRED`; duplicate/collinear vertices fail. The top and visible side interiors of a convex prism do not overlap. No center-depth sort is used. For assembly audits, the public `orderProjectedFaces` API intersects convex projected face polygons and compares depth across the overlap. A depth reversal or painter cycle requires splitting; coplanar overlapping faces require an explicit layer. Its returned order is usable only if diagnostics are empty. This audit does not run automatically over animated 2D assemblies. The fixtures declare order, including standoffs below the carriage and locating pins above it.

Projection uses xyz with z up, radians for API angles, and `deg`/`rad` for `.afx` azimuth/elevation. Defaults are azimuth pi/4 and elevation atan(1/sqrt(2)); origin defaults to (0,0), scale to 1. Elevation is strictly between 0 and pi/2. Coordinates/dimensions are finite with magnitude <=1,000,000. Solids allow 3..256 vertices, object IDs of at most 28 characters and vertex IDs of at most 20. Cylinder sampling uses an inscribed polygon with error bound `scale * radius * (1 - cos(pi / steps))` in projected project units. Default tolerance is 0.5; explicit steps must meet tolerance and be 8..256. Subsequent 2D scaling magnifies that bound. Keep steps fixed for dimensional edits that need correspondence. Sampling, ring order, visibility or landmark changes can change topology. There is no simplification during playback. Same-tone cylinder facets share contiguous boundary fills to avoid internal antialiasing seams; individual face geometry/IDs remain available.

`materials` accepts top/light/dark colors or full material objects. Side orientation selects light/dark against a fixed horizontal light direction; this is illustration shading. Source parameters survive in `Actor.solid`, alongside canonical generated geometry. `SOLID_STALE` rejects a changed recipe without matching rebuilt shapes. Geometry validation permits 1e-9 absolute plus 1e-12 relative numeric error for cross-engine trig; it retains the submitted coordinates, without rounding or replacing them.

Node handles are **relative offsets**, so moving a node moves its handles. Corner preserves independent in/out handles (omitted handles are zero); mirrored makes incoming the negative outgoing; aligned retains incoming length and points it opposite outgoing. Outgoing controls direction in coupled modes; when omitted in those modes it is derived from incoming. An aligned zero outgoing handle with nonzero incoming length fails. A contour accepts either nodes or explicit start/cubics. Node IDs become segment IDs in traversal order. Constructors allow 2..256 nodes, at least three if closed. `Contour.authoring` retains editable source; `editContourNode`/`rebuildContour` rebuild controls and `CURVE_STALE` rejects stale controls. Catmull–Rom uses centripetal knots (alpha=1/2), clamped open endpoints and zero tangents at repeated spans. It keeps repeated landmarks instead of deleting/reindexing them. It makes no guarantee against global self-intersection or silhouette loss during morph. Morphs check ordered IDs, closure and exact cubic signed-area winding; topology-changing edits diagnose `MORPH_TOPOLOGY`. Author breakdown poses where direct interpolation is unsuitable.

```afx
// Inside a shot; the part declares anchors:{grip:(0,0);};
contact carry {
  target:@lamp; anchor:@hero.hand;
  targetPoint:(0,-20); anchorPoint:grip;
  start:60f; end:192f;
}
```

A contact binds an actor to a part's world matrix while preserving the actor's world pose. Points must already coincide within 0.01 project units at start; `CONTACT_GAP` rejects snapping. Points are local xy tuples or declared landmark names (target names come from a solid's xyz anchors). Start is inclusive, end releases at its boundary pose. Later free motion is relative to the unconstrained end pose; the corrected transform persists into subsequent shots. Bind/release matrices are derived from absolute tracks on each seek. Singular transforms and unrepresentable shear diagnose `TRANSFORM_SINGULAR`/`CONTACT_SHEAR`. Anchors must belong to actors that do not descend from constrained actors; chained contact and concurrent parent/transform writers are diagnosed. Budget: 16 contacts and 4096 frames per contact-bearing shot, exhaustively audited at integer frames including release and shot boundary. Layer keys choose the last key discretely, with no numeric layer interpolation.

```afx
part glass {
  shape:@window; clip:@window;
  material:{fillRule:evenodd;fill:{type:radial;
    from:(0,28);to:(0,28);radius0:0;radius1:38;
    stops:[{offset:0;color:"#fffbe2";},{offset:1;color:"#e6bc77";}];
  };};
}
```

Fill coordinates and clip shapes use the **part's local projected coordinates**, then receive the same world and camera transforms as the drawing. Nonuniform scale also scales radial circles into ellipses. Linear gradients require distinct endpoints, radial fills require `0 <= radius0 < radius1`; two to 32 ordered stops in [0,1] use RGB/RGBA hex colors. Clips apply `material.fillRule` (nonzero/evenodd) to shapes, images and text and are restored per command. Both native Skia and browser Canvas use the shared renderer implementation. No blur, feathering, blend mode or transparent-glass simulation is implied. Unknown fields and unsupported constructions fail validation rather than silently disappearing.

The playground exposes optional nodes/handles, pivots/spatial anchors and layer-order overlays using the existing scrubber. Its critical-frame PNG includes shot starts, contact/morph bind/mid/end boundaries and layer/parent changes; it refuses sheets exceeding 24 frames. Overlays do not modify export state.

`fixtures/short/little-light-authored.afx` is the editable successor to the retained historical short: the same character/assets, three shot lengths, anticipation and reach/lift breakdowns, parametric table/lamp and layered grip. `fixtures/assembly/guide-carriage.afx` separates and reassembles standoffs, a carriage and dial, reusing a guide component with radii 10 and 14. Both are public-language examples, not generated cubic dumps. Run `npm run check`, `npm test -- tests/node.test.ts -t 'integrated vector scenes'`, `npm run playground:build` and `node scripts/verify-playground.mjs`. Native export uses the existing CLI `render` command and a fresh output path. Renderer parity is sampled under mean absolute channel error <=2 and differing-pixel ratio <=0.05; this is local verification, not other-platform or artistic qualification. See KI-12 in [known issues](../KNOW-ISSUES.md).

## Offline parametric lamp/table demonstrator

`node scripts/create-parametric-demo.mjs` regenerates `fixtures/parametric/lamp-table.afx`: 384 frames at 24 fps, with assembled, separated/reassembled and close-up lifting shots. It uses existing cubic shapes, solid materials, part transforms, camera framing and discrete actor parenting. This historical fixture keeps its original canonical shapes; the public-language successors above demonstrate editable parameters. No runtime dependency is added.

`scripts/parametric-geometry.mjs` is a compatibility adapter to the public core constructors for this historical fixture. It retains the old signatures, landmark IDs and paint groups. `projection` accepts an origin, positive scale and azimuth/elevation in radians; its default angles give an isometric orthographic view. `extrude` accepts a strictly convex counterclockwise xy ring with unique landmark IDs, z, height and top/light/dark colors. It rejects concave, crossing and collinear rings. `cylinder` creates an inscribed polygon, with a projected chord-error tolerance and a maximum of 256 vertices. Supplying `steps` fixes sampling across dimensional edits and must still satisfy the tolerance; automatic sampling can change topology. These solids produce straight edges encoded as exact cubic line segments, rather than claiming exact circular curves.

`createDemo({tableWidth, lampRadius, cylinderSteps})` keeps source parameters, world vertices, face normals, approximation bounds and topology signatures outside the canonical document. Face IDs derive from object/landmark IDs. Edit the generator and regenerate; the `.afx` is generated output, not the parameter source. Radius/width edits with fixed sampling preserve IDs, while changes to vertex IDs/count/order or visible faces require correspondence review. Internal geometry retains floating-point precision. Projection is baked before playback and the ordinary 2D shot camera subsequently transforms it.

Each solid's faces share a part hierarchy for separation. The piece order is explicitly authored for this fixture; no center-depth sort or general occlusion solver is provided. Glass is opaque illustration. The prepared mechanical grip has a rear finger below the lamp and a front finger above it. At attachment both the grip anchor and lamp root have identity transforms, so parenting preserves world pose without requiring matrix decomposition; subsequent absolute keys move them together. This is a bounded contact example, not a generic reparenting or character-rigging API.

Cylinder side faces of the same tone are filled together as contours of one path, so shared internal edges do not receive separate antialiasing coverage. Individual face parts retain their IDs and geometry as unpainted authoring anchors; paint groups follow the same piece transform. No stroke expansion or silhouette enlargement is used. Shading remains deliberately faceted, with distinct light/dark tones.

The sequence is an assembly explanation followed by lifting: frames 0–95 hold the assembled view; 96–143 separate the pieces; 144–180 hold the separated view; 181–228 return them to the assembled pose; 229–239 hold it. The close-up starts at 240, attachment is at 264, lifting finishes at 348, and frames 349–383 hold the raised lamp. Separation uses authored projected offsets, not a physical disassembly simulation.

After building, run `npm test -- tests/node.test.ts -t 'parametric lamp/table'` for regeneration, edits, unsupported geometry, full shuffled/reverse seek and contact checks. `node scripts/verify-parametric-demo.mjs` compares all 384 Chromium/Skia frames using the existing renderer-spike tolerances (mean absolute channel error <=2; pixels differing by more than two channel levels <=5%), checks framing and a front-finger visibility sample, and creates a contact sheet and native WebM in a fresh ignored `.work/parametric-*` directory. It also measures p95 evaluation/draw times and native export against The Little Light at 960×720, and independently counts decoded frames with FFprobe. An optional output directory must not contain existing result files. Measurements are single-host observations, not release performance or cross-platform qualification; coordinator RSS does not measure the entire process tree. See KI-12 in [known issues](../KNOW-ISSUES.md) for remaining artistic/occlusion acceptance.
