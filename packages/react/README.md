# @aether-fx/react

Experimental React 19.3 ESM client component. React is a peer dependency and is never bundled. The distributed entry preserves `'use client'`; importing it in Node performs no DOM access. SSR emits a valid container/canvas. Effects create the existing Canvas player and own its verified image/font/audio resources.

```tsx
'use client';
import { useRef } from 'react';
import { FxPlayer, type Player, type AssetResolver } from '@aether-fx/react';
import type { PlaybackPlan } from '@aether-fx/core';
const resolveAsset: AssetResolver = async (asset, signal) => {
  const response = await fetch('/assets/' + asset.id, { signal });
  if (!response.ok) throw new Error('Asset unavailable: ' + asset.id);
  return response.arrayBuffer();
};
export function Preview({ plan }: { plan: PlaybackPlan }) {
  const player = useRef<Player>(null);
  return <>
    <FxPlayer plan={plan} resolveAsset={resolveAsset} ref={player} onReady={() => player.current!.seekFrame(97)} />
    <button onClick={() => void player.current!.play()}>Play</button>
  </>;
}
```

Define the resolver in the client component; pass only a serializable plan across the Next server/client boundary. Keep plan and resolver identities stable during ordinary UI rerenders. Changing either releases the previous session, aborts loading and starts a new one. `onReady` and `onError` always receive current callbacks without restarting the session. The component's ref exposes the existing `Player` controls; calls before readiness or after disposal fail explicitly. `dispose` releases the entire owned session; remount or change the plan/resolver to initialize again.

Resources finish loading before `onReady`. No AudioContext starts until a gesture calls `play`. The component observes its width and resizes the canvas at the device pixel ratio while preserving project aspect ratio; window resize also handles display/DPR changes. CSS class/style apply to the container, and `ariaLabel` labels the canvas. Effects handle StrictMode setup/cleanup replay and asynchronous load cancellation; no frame updates enter React state. Unmount releases RAF, audio, font/image maps, observers and listeners.

Original code is licensed under Apache-2.0; see LICENSE and NOTICE. The real tarball and production Next checks are recorded in the repository release-readiness report.
