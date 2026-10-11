# React and Next App Router

The reference matrix is React 19.3.0 and Next 16.4.0, pinned in the root/example lockfiles. The React package uses React as a peer and keeps `'use client'` at the beginning of its built ESM entry. It imports the existing Canvas player; no DOM, audio or asset resolution executes at module import. The package can be imported and rendered to HTML in Node.

## Server compilation, client ownership

`examples/next-app/app/page.tsx` calls `loadProject` on the server for the original illustrated short. The page is dynamically server-rendered, and only the plain serializable PlaybackPlan crosses into the client Preview. The client defines an explicit asset resolver that fetches the prepared public asset IDs. Functions, decoded assets and player instances do not cross the server/client boundary.

```tsx
'use client';
import { useRef } from 'react';
import { FxPlayer, type Player, type AssetResolver } from '@aether-fx/react';
import type { PlaybackPlan } from '@aether-fx/core';
const resolveAsset: AssetResolver = async (asset, signal) => {
  const response = await fetch('/assets/' + asset.id, { ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error('Unable to load ' + asset.id);
  return response.arrayBuffer();
};
export function Preview({ plan }: { plan: PlaybackPlan }) {
  const player = useRef<Player>(null);
  return <>
    <FxPlayer plan={plan} resolveAsset={resolveAsset} ref={player}
      onReady={() => player.current!.seekFrame(97)} />
    <button onClick={() => void player.current!.play()}>Play</button>
  </>;
}
```

Wait for `onReady` before enabling controls and catch `play()` failures in the host UI. The ref exposes play, pause, seekFrame, setPlaybackRate, getCurrentFrame, getStats, resize and dispose. Calls requiring a player before readiness or after disposal throw explicitly. Ref disposal releases the component's entire owned session, including pending loading and resources; remount or replace plan/resolver to initialize again.

Keep the plan and resolver identities stable during ordinary UI renders. Replacing either aborts and releases the old session before starting a new one. The latest onReady/onError callbacks are read through an Effect Event, so changing presentation callbacks does not reload assets. Do not mutate a compiled plan; pass a new validated plan for an edit. Runtime playback frames stay in the imperative player. The example updates React state only for controls, readiness, errors and explicit frame selection/pause.

## Lifecycle and size

SSR emits the container and a project-sized canvas without effects or resource requests. After hydration the effect loads SHA-256-checked real images/fonts/WAV, creates the player, resizes it to the container width at device pixel ratio, and attaches one ResizeObserver and one window resize listener. Project aspect ratio is preserved. No AudioContext is constructed until a user gesture invokes play.

Cleanup aborts loading, disconnects observation/listening, disposes the player and releases the loaded bitmap/font/audio maps. A result arriving after cleanup is also disposed. React's extra development StrictMode setup/cleanup replay is tested independently from production Next. Resource cancellation and asset failures call cleanup; an intentional unmount abort does not call onError. Display errors through the host's onError callback.

## Run the example from real packages

```sh
npm ci
npm run build
node scripts/prepare-next-example.mjs
cd examples/next-app
npm run build
npm start
```

Preparation packs six current packages, installs their real tarballs and copies the licensed project and declared asset bytes into the private example. The example lockfile records local artifact paths for this checkout; preparation is required before its build. It does not put file/workspace dependency protocols in any distributed package. The Next build uses default Turbopack and contains no source aliases, transpilePackages setting, or ssr:false workaround. The project directory must remain available to the server; this example does not claim standalone deployment packaging.

Use Play/Pause, seek frame 97, scrub, change speed, restart and navigate to About/back. Restart resets frame and displayed/actual playback rate to one.

## Executed proof

`node scripts/verify-react-next.mjs` creates a separate temporary consumer and installs six real tarballs. It checks the client directive and external React import, loads the package in Node with throwing DOM globals, and renders valid SSR HTML without asset resolution. It then builds and starts a real Next production server, verifies its SSR canvas, hydrates in Chromium and compares frame 97's PNG exactly with the offline renderer at matching dimensions.

Gesture play/pause, direct seek, actual AudioBufferSourceNode playback rate and restart are checked. Ten real App Router navigation cycles leave zero declared fonts, open bitmaps, open AudioContexts, observers, resize listeners and scheduled animation callbacks. The production page emits no browser errors during the test.

A separate browser bundle uses development React and StrictMode. It proves the extra effect replay occurred through resolver invocation/cancellation counts, exercises plan and resolver replacement, current callbacks during loading, partial-load unmount, integrity failure and ref disposal. Fifty additional mount/play/unmount cycles use the actual font, PNG, WAV and AudioContext; they finish with no owned open resources, observers/listeners or RAF callbacks. Instrumentation wraps native APIs and counts their real lifetimes; it does not supply mock assets, decoders or audio clocks. These counters intentionally retain closed AudioContext objects for inspection, so this verifier is not a memory benchmark.

The same production and StrictMode checks also pass under Node 22.12.0 via `npm exec --yes --package=node@22.12.0 -- node scripts/verify-react-next.mjs artifacts/next-packages-node22`. Evidence: `artifacts/next-packages/react-next-report.json`, the separate Node 22 report, build/start logs, six tarballs and SHA256SUMS. React Doctor 0.9.17 full-project scans of the package and Next example found no diagnostics; score/network reporting was disabled. This establishes the local Chromium/macOS reference, not Firefox/WebKit, physical mobile, full pipeline memory or final publication readiness.

## Primary lifecycle references

- [React useEffect](https://react.dev/reference/react/useEffect): client effects, dependency changes and symmetric cleanup.
- [React StrictMode](https://react.dev/reference/react/StrictMode): extra effect replay is a development check.
- [React useEffectEvent](https://react.dev/reference/react/useEffectEvent): current callbacks for effect events without making them effect dependencies.
- [React useImperativeHandle](https://react.dev/reference/react/useImperativeHandle): expose controls through the component ref.
- [Next server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components): client entry directives and serializable boundary data.
