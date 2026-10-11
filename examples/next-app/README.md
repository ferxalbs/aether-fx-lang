# Little Light · Next App Router example

React 19.3.0 / Next 16.4.0. This example compiles the original .afx on the server, passes only the serializable plan to a client Preview, and imports the packaged FxPlayer with its retained client directive. It has no source aliases, transpilePackages, or ssr:false workaround. The client owns its resolver and uses imperative controls; playback frames do not update React state.

From the repository root:

```sh
npm ci
npm run build
node scripts/prepare-next-example.mjs
cd examples/next-app
npm run build
npm start
```

Preparation creates real local tarballs, installs them and copies the declared demo project/assets; no unpublished packages are fetched from npm. The installed lockfile intentionally records local tarballs for this checkout example, not publishable package dependencies. Run preparation again after changing local packages. All package manifests use public version ranges internally. The automatic isolated verifier performs a separate install with real tarballs in a temporary directory.

Open loopback port 3000, play through a user gesture, seek frame 97, scrub, change speed, restart, and navigate to About/back. Unmount releases resources and audio. Resource/license provenance is copied with the project. The filesystem project must be present at runtime; this example does not claim a standalone deployment bundle.

Production Next checks and a separate development React StrictMode replay test are required: StrictMode's extra effect replay does not run in production. See `scripts/verify-react-next.mjs` and release readiness for the executed evidence.
