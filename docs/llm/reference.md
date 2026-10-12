# AETHER Fx authoring pack (v0.1 syntax / 0.2.0-rc.1 packages)

Return a complete `project ID { ... }`, not JavaScript or Markdown. `.afx` is bounded declarative data. No execution, wall clock or random numbers. Relative module imports require an explicit host resolver; cyclic definitions fail. Fields end in `;`; declarations do not. JSON strings; comments `//` and `/* */`. IDs start with a letter, at most 64 ASCII letters/digits/_/-. References are `@id`, target `@actor.part`, or `camera`. Canonical schema stays 1 (additive easing extension).

Minimal complete source:

```afx
project hello {
 viewport:(640,360); fps:(24,1);
 shape dot {primitive:circle; radius:30;}
 part dot {shape:@dot; material:{fill:"#2563eb";};}
 actor dot {parts:[@dot]; transform:{x:80;y:180;};}
 scene movie {shot move {duration:2s;
  key a {target:@dot; property:x; frame:0f; value:80; easing:ease-in-out;}
  key b {target:@dot; property:x; frame:47f; value:560;}
 }}
}
```

Geometry: `shape id {primitive:rect;size:(w,h);}`, `roundedRect` adds `radius:r`; `circle radius:r`; `ellipse radius:(rx,ry)` centered at origin; `line from:(x,y);to:(x,y)`; `polygon points:[(x,y),...]` (3..10000); `star radius:r;innerRadius:r;count:5` (3..5000). SVG `primitive:path;data:"M0 0 L40 0 Q60 20 40 40 Z";` accepts M/L/H/V/C/S/Q/T/A/Z and lowercase relative forms. Arc flags 0/1; arcs become <=90° cubic pieces, coincident endpoints omit arc, zero radius becomes line. All shapes expand to cubic contours with stable outline/segment IDs. SVG arcs approximate ellipses; this is not arbitrary SVG/XML import. Morphs require the same contour order, IDs, closure and segment IDs/count, including arc subdivisions. No geometric rematching.

v0 cubic shape syntax remains:
`shape g {contour outline {start:(0,0);closed:false;cubic s0 {control1:(20,0);control2:(40,40);end:(60,40);}}}`.

`part p {shape:@g;}` defaults identity transform, layer 0, pivot (0,0), fill black and no stroke. Material `{fill:"#RRGGBB";stroke:null;strokeWidth:0;fillRule:nonzero;}`. Use `fill:null` on lines. Image content `{asset:@image;width:100;height:100;}`; text `{content:"Hello";font:@font;size:32;}`. Choose one content type. `asset font {kind:font;src:"font.ttf";}`: paths local to source; declare licensed fonts, no implicit system-font substitute. Text shaping/rasterization is backend dependent; no outline determinism claim. `parent:@otherPart` on parts is static. `actor a {parts:[@p];transform:{x:100;y:100;};layer:1;parent:null;}` needs >=1 distinct part.

Transforms: x/y, scaleX/scaleY, rotation with deg/rad, opacity [0,1], visible boolean. Target actor or actor.part; shape/parent/visible switch discretely. Camera targets support x/y/scaleX/scaleY/rotation; scale must stay positive and cannot use overshooting easing.

FPS `(numerator,denominator)` positive integers. Frame fields duration/frame/start/end/offset/trimStart/hold accept f/s/ms. Decimal lexemes converted with BigInt rationals, each absolute time rounded nearest, ties away from zero. `f` is integer. No accumulated float durations. Shots concatenate. Keys are shot local: `0 <= frame < duration`; final image is duration-1. Morph/exposure end may equal duration. `hold:2f` samples one track on twos.

Anchors inside shot: `anchor beat {at:500ms;}` or `anchor next {after:@beat;offset:250ms;}`. Key `frame:@next;offset:125ms;` supports simultaneous starts with independent offsets. Morph/expose start/end can reference anchors. Anchors including unused ones are checked for cycles, missing names, depth <=32 and shot bounds. Offsets are rounded independently in frame space after anchor resolution. Repeat `stagger:100ms` shifts each instance by index times the exact authored rational time, rounded once per instance.

Easing `linear`, `ease-in`, `ease-out`, `ease-in-out`, `back-in`, `back-out`, `back-in-out`, `bounce-out`, or `(x1,y1,x2,y2)` with x in [0,1]. Left key controls interval easing. Bézier evaluated by fixed bisection. Back/spring can overshoot position; opacity clamps. Discrete keys must use linear. Spring: `easing:{type:spring;frequency:12;damping:0.7;velocity:0;};` analytic damped response from displacement 0 towards 1, initial derivative velocity, frequency rad/interval [6,50], damping ratio [0.1,1], velocity [-2,2]. Time domain [0,1] is the key/morph interval. Divide response by response(1) to end exactly at 1; start exactly 0. No previous frame or numerical integration. Initial derivative after normalization is velocity/response(1). Camera scale rejects spring/back and overshooting Bézier.

Constants: `const width {value:100;}` then `size:(@width,60)`. Theme `theme palette {accent:"#2563eb";}` then `fill:@palette.accent`. Values are data, no arithmetic or string interpolation.
Components:
`component tile {params:{x:0;color:"#2563eb";};shape g {primitive:rect;size:(60,60);}part p {shape:@g;material:{fill:@color;};}actor a {parts:[@p];transform:{x:@x;};}}`
`instance first {component:@tile;args:{x:100;};}` prefixes local IDs as first_g/first_p/first_a. References to local definitions rewritten; external assets retained. Nested instances allowed without recursive dependency cycles. `repeat row {count:3;stagger:100ms;instance dot {component:@tile;args:{x:@index;};}}`: index is 0-based scalar. No arithmetic is available, so use individual args for spatial positioning. Repeats prefix row_0_dot, etc. Limits: 1000 instances, depth 32, 20000 declarations, 100000 substituted values; parser 2 MB, nesting 64; canonical limits also apply. Limits checked before large expansion; cycles rejected even if unused.

Compact tracks: `track gaze {target:@hero.eyes;property:x;hold:2f;keys:[{id:start;frame:0f;value:0;},{id:notice;frame:72f;value:5;}];}`. Declare target/property once; keys override easing/rotationMode/hold defaults and may use time anchors/offset. Named IDs become gaze_start/gaze_notice, omitted IDs are indices. Duplicate labels and incompatible writers fail.

Clips: `clip move {duration:24f;params:{who:@hero;};morph m {actor:@who;from:@rest;to:@reach;start:0f;end:24f;}}`. In a shot: `play first {clip:@move;start:48f;args:{who:@hero;};}`. Optional play duration must equal the definition; no retiming/trimming. Supports keys/tracks, morphs, exposures, contacts, local anchors and nested plays. Each time rounds independently before adding the start. Complete span must fit. Event IDs acquire play prefixes; only local anchors are remapped, external pose/drawing references remain stable. All clip cycles checked, depth <=32, lowering <=20000 declarations; ordinary frame/writer constraints still apply.

Modules: entry `import art {src:"art.afx";}` loads a `module art { ... }` root with declarations only into shared project scope. Paths relative to importing file, canonical IDs included once, cycles rejected, <=64 dependencies/depth 32/combined 2 MB including entry. Browser `compileSource(text,manifest,{sourceId,resolveModule})` requires a preloaded host resolver returning `{id,source}`, with no implicit IO. Node loadProject limits real paths to the entry directory; asset paths stay relative to that directory. Diagnostics retain original locations plus range.source. See language-v0.1.md for executable modular examples.

Bounded arm helper inside pose: `arm reach {actor:@hero;upper:@frontArm;fore:@foreArm;hand:@hand;lengths:(104,120);target:@lantern;point:(-2,-31);offsetPoint:(0,0);grip:(18,-5);elbow:negative;rotation:0deg;}`. Outputs ordinary pose rotations at compile time. Parts have zero pivots/unit scales and the named parent chain; fore/hand x placements equal lengths, y zero; parent must be rigid unit scale. Target is a project xy point or actor/part authored placement; point is target-local, offsetPoint project-space, grip hand-local. Hand angle is world rotation. Explicit elbow positive/negative; unreachable/zero-distance goals fail. Optional initial:true supplies default arm rotations once; concurrent explicit or initial writers conflict. This is not runtime/general IK.

Poses `pose neutral {parts:{p:{transform:{rotation:0deg;};};};}` (canonical pose rotation: source units). `morph m {actor:@a;from:@neutral;to:@happy;start:0f;end:24f;easing:ease-out;}` requires explicit matching properties and compatible shapes. `drawing blink {parts:{p:@closed};}` then `expose e {actor:@a;drawing:@blink;start:12f;end:14f;}` temporary override. `initial a {x:100;opacity:1;}` sets shot boundary. Actor parts/poses refer to definition IDs; key targets refer to instances.

Tools: `afx check file.afx --json` outputs ok/diagnostics with code, severity, range (UTF-16 offsets, line/column), canonicalPath, expected/found where known. `afx fix file.afx --safe` inserts only an unequivocally missing semicolon if parsing then succeeds, checks source unchanged and revalidates. It never infers units or intent. `afx fmt file.afx` prints normalized formatting (comments omitted); `--write` writes explicitly. `afx expand file.afx` prints canonical JSON. `afx compile ... --out plan.json` creates a plan with verified asset hashes. `afx render ... --backend native|chromium --out new.webm`; WebM default. MP4 needs actual probes `afx probe mp4`; unsupported is explicit. Output paths must be new.

GBNF in afx.gbnf describes structural syntax, not validity. Semantic requirements (declaration context, property types, IDs, assets, geometry, dimensions, units, cycles, limits, morph topology, frame intervals, camera overshoot, font availability) require `check`. GBNF uses ordinary ASCII whitespace; parser also accepts ECMAScript Unicode whitespace. JSON strings may contain Unicode, with CR/LF escaped. Grammar/parser parity report covers the declared corpus, not a proof of equivalence for all strings.

Composition: background layer behind content; choose readable local contrast >=4.5:1 during declared reading intervals. Keep required text/geometry inside margins; allow background bleed, declared offscreen entrance/exit/fade and intended stillness. Check first, quarter, half, three-quarter and final frames. Validation is not aesthetic evaluation. Inspect head/neck/torso continuity, hands contacting held objects, layer order and final poses.
