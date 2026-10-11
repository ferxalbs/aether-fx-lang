# @aether-fx/core

Experimental AETHER Fx schema 1 and universal ESM runtime. Pure document validation, compilation, absolute-frame evaluation, rational timestamps, JSON roundtrips and atomic structured edits. No DOM, filesystem, network, React or parser import.

`compile(document, manifest, limits?)` returns a discriminated Result. Compiled plans are deeply frozen. `evaluate(plan, { frame })` accepts integer frames in `[0,duration)` and returns independently owned numeric drawing commands. `deserializePlan` verifies supplied snapshots by recompilation. Assets must be resolved explicitly by the host.

Node 24.21 and Node 22.12 have passed foundation tests and isolated consumers locally. Full v0 CI verification is pending. Package API is experimental; schemaVersion is independent of package version. Original code is licensed under Apache-2.0; see LICENSE and NOTICE.
