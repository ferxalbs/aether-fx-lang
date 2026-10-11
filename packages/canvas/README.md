# @aether-fx/canvas

Experimental Canvas 2D renderer, explicitly resolved resources and imperative player. ESM imports have no top-level DOM access. Construct renderers and players in browser effects or browser code.

`createRenderer(canvas, resources?)` draws numeric DrawLists into the canvas backing dimensions. `loadResources(plan, resolver, signal?)` checks SHA-256 integrity and image/audio metadata, loads declared fonts, and returns resources with `dispose`. Resolver I/O belongs to the host. Resource ownership belongs to the caller; player/renderer disposal does not dispose shared resources.

`createPlayer(canvas, plan, resources?)` exposes play/pause/seekFrame/setPlaybackRate/getCurrentFrame/getStats/resize/dispose. Call play from a user gesture for audio. Resize accepts CSS dimensions and DPR. Dispose is idempotent, cancels RAF, disconnects audio and closes its owned AudioContext.

The API is experimental. The inherited ISC declaration and copyright owner need confirmation before public release. The complete visual/audio acceptance gates remain separate from a successful fixture render.
