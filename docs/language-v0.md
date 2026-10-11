# AETHER Fx language v0

Experimental schema 1. `.afx` is declarative data: there are no imports, functions, loops, evaluation, expressions or implicit network operations. The executable fixture is `fixtures/curve.afx`.

## Grammar

```ebnf
document    = declaration, EOF ;
declaration = identifier, path, "{", { field | declaration }, "}" ;
field       = (identifier | string), ":", value, ";" ;
value       = string | number, [identifier] | identifier | "@", path
            | "[", [value, {",", value}], "]"
            | "(", [value, {",", value}], ")"
            | "{", {field}, "}" ;
path        = identifier, {".", identifier} ;
identifier  = letter, {letter | digit | "_" | "-"} ;
```

This syntax grammar is followed by typed contextual validation. Exactly one `project ID` is required. Declarations are not permitted inside property objects. Properties, including object-valued properties, always end in semicolons. Named declarations do not end in semicolons. Strings use JSON double-quote escapes. `//` and `/* ... */` comments are accepted and ignored. Tuples and arrays both normalize to arrays. Bare identifiers represent enum strings, except `true`, `false`, `null`.

Canonical IDs must match `[A-Za-z][A-Za-z0-9_-]{0,63}`; constructor, prototype and __proto__ are reserved unsafe names. Targets allow one dot: `@hero.hand`. Repeated IDs within a collection and repeated property names are errors. Scene declarations group shots without adding runtime state. Unknown keywords or properties are errors.

## Units and time

`frame`, `duration`, `start`, `end`, `offset`, `trimStart`, `hold` require `f`. Rotations require `deg` or `rad`, including rotation key values. Other numbers have no units. Frames are integer, nonnegative; duration and hold are positive. FPS is `(numerator, denominator)`, both positive integers. Viewport is `(width,height)` in project units.

Shots concatenate in source order. Keys use shot-local frames and must satisfy `0 <= frame < duration`. Initial values hold until the first key. A left key controls easing and hold for interpolation to its successor. `rotationMode: direct` interpolates the authored difference; `shortest` wraps to `[-pi,pi)` (the exact half-turn chooses negative). `hold: 2f` samples only that track on twos; it does not slow other tracks or the camera.

Morphs require `0 <= start < end <= duration`. Their final state persists. Exposure ranges are half-open and temporarily override the base drawing. Consecutive shots inherit the preceding boundary snapshot with explicit initial overlays. Each shot has an independently declared camera, defaulting to identity.

## Declarations and properties

| Declaration | Context | Fields |
| --- | --- | --- |
| project | root | version (default 1), revision (default 0), viewport, fps |
| asset | project | version (1), kind image/font/audio, src, locked (false) |
| shape | project | contour children |
| contour | shape | start, closed (true), cubic children |
| cubic | contour | control1, control2, end |
| part | project | parent (null), pivot (0,0), transform, layer (0), shape/text/image, material |
| actor | project | parts, transform, parent (null), layer (0) |
| pose | project | parts map: partial transform and/or shape per part |
| drawing | project | parts map: shape reference per part |
| background | project | actor, parallax in [0,1] |
| scene | project | shot children |
| shot | scene | duration; initial/key/morph/expose/camera children |
| initial | shot | declaration ID is target; transform fields, layer, shape, parent |
| key | shot | target, property, frame, value, easing (linear), rotationMode (direct), hold (1f) |
| morph | shot | actor, from, to, start, end, easing (linear) |
| expose | shot | actor, drawing, start, end |
| camera | shot | x/y (0), scaleX/scaleY (1), rotation (0rad); one declaration |
| audio | project | asset, offset (0f), trimStart (0f), duration, gain (1); one track |

All omitted transform components use x/y/rotation = 0, scaleX/scaleY/opacity = 1, visible = true. Partial pose transforms remain partial. Material defaults: fill black, no stroke, width 0, nonzero. Text is `{ content: "..."; font: @fontAsset; size: 24; }`; image is `{ asset: @imageAsset; width: 100; height: 100; }`. A part must have exactly one content type. Font/image/audio definitions require a separately resolved manifest; the core does not load them.

Easing is `linear` or `(x1,y1,x2,y2)` with x controls in [0,1]. Camera scale easing additionally keeps y controls in [0,1]. Geometry easing may overshoot; evaluated opacity clamps to [0,1]. Morph geometry must have matching contour/segment IDs, counts, ordering and closure. Discrete layer/visibility changes use keys or drawings, not morphs. Conflicting property tracks are errors.

Limits default to 2 MB UTF-8 source, nesting/hierarchy depth 64, 1000 parts, 100000 segments, 10000 track entries, viewport dimension 8192 and one million frames. The exported core APIs accept smaller or larger host-supplied limits; a separate structural JSON visit ceiling is fixed at two million values.

## JSON and API boundaries

`packages/core/src/document.schema.json` defines document, manifest and plan shapes. Canonical angles are radians and canonical frames have no string units. Schema versions are separate from npm versions. Unknown schema versions are rejected. Document deserialization checks structure; compile validates references, assets, topology and temporal semantics. Plan deserialization also rebuilds and verifies every supplied snapshot.

`print(parse(source).value)` emits semantically equivalent source. It preserves IDs and units, but does not retain comments or original formatting. Diagnostics use source ranges for source input and JSON paths for canonical data; schema errors map canonical paths to the originating field/tuple value, including nullable text/image/audio objects and normalized names. Missing fields highlight their enclosing owner. EOF errors use a zero-width range at the actual end of source; unit ranges include their suffix. Semantic reference/conflict errors identify their affected declaration.
