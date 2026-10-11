# @aether-fx/compiler

Experimental declarative `.afx` lexer/parser and normalizer built with Chevrotain. Exports `parse`, `normalize`, `print`, `compileSource`, and AST types. ESM only; source is never executed as JavaScript. Browser/Node compatible.

`parse(source)` returns an AST or diagnostics with source ranges. `normalize(ast)` resolves units/defaults and checks the canonical schema. `compileSource(source, assetManifest?)` adds semantic validation and builds a PlaybackPlan. `print(ast)` preserves meaning and IDs, but not comments or original formatting. Frame fields require f; rotations require deg/rad. All property values end in semicolons, including object values.

The API is experimental. Original code is licensed under Apache-2.0; see LICENSE and NOTICE.

The local 0.2 candidate adds bounded primitives/SVG paths, exact rational s/ms time conversion, anchors, named/analytic spring easing and compile-time const/theme/component/instance/repeat expansion. Existing v0 documents remain valid. See the checkout's docs/language-v0.1.md and docs/llm/ for normative syntax, expansion limits, diagnostics and complete examples.
