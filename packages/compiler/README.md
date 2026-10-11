# @aether-fx/compiler

Experimental declarative `.afx` lexer/parser and normalizer built with Chevrotain. Exports `parse`, `normalize`, `print`, `compileSource`, and AST types. ESM only; source is never executed as JavaScript. Browser/Node compatible.

`parse(source)` returns an AST or diagnostics with source ranges. `normalize(ast)` resolves units/defaults and checks the canonical schema. `compileSource(source, assetManifest?)` adds semantic validation and builds a PlaybackPlan. `print(ast)` preserves meaning and IDs, but not comments or original formatting. Frame fields require f; rotations require deg/rad. All property values end in semicolons, including object values.

The API is experimental. The inherited ISC declaration and copyright owner need confirmation before public release.
