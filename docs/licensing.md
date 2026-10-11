# Licenses and dependencies

Original AETHER Fx code, documentation and original fixture artwork/audio are Apache-2.0. [LICENSE](../LICENSE) contains the full license and [NOTICE](../NOTICE) preserves attribution. Builds include both files unchanged in all seven packages. Third-party software retains its own license.

| Dependency | Version | License / role |
| --- | --- | --- |
| Chevrotain and its packages | 13.2.0 | Apache-2.0; compiler parser |
| Mediabunny | 1.61.3 | MPL-2.0; browser muxing; unmodified |
| Playwright / playwright-core | 1.64.0 | Apache-2.0; Node browser adapter |
| @napi-rs/canvas | 1.0.11 | MIT; Skia frame renderer |
| @mediabunny/server (optional peer) | 1.61.3 | MPL-2.0; explicit integrated encoder adapter |
| node-av (optional peer) | 6.1.1 | MIT wrapper; FFmpeg binaries have separate, unresolved terms |
| React (peer) | 19.3.0 reference | MIT; React player |
| @mediabunny/aac-encoder (optional peer) | 1.61.3 | MPL-2.0 wrapper with FFmpeg AAC WASM; separate upstream terms |

The lockfile records exact transitive and platform dependencies. Package builds leave third-party imports external; their installed packages retain license/source files. No Mediabunny source is modified. The optional AAC encoder is not installed by the default public dependency graph; install it explicitly for `@aether-fx/export/aac`. Its [upstream build instructions](https://mediabunny.dev/guide/extensions/aac-encoder) describe FFmpeg WASM; bundling it requires preserving applicable notices, corresponding source and build/relinking requirements. No codec patent clearance is asserted.

The CLI contains the unmodified Nunito TTF, Copyright 2014 The Nunito Project Authors, under SIL Open Font License 1.1, with its complete OFL text beside it. See [asset provenance](../fixtures/short/ASSETS.md). Fixture hashes identify exact bytes.

Node video export renders with Skia and starts a separately installed FFmpeg executable; the explicit Chromium renderer additionally starts Playwright Chromium. They are not redistributed in AETHER tarballs. Their respective upstream licenses apply to their distributions; FFmpeg's license depends on build configuration. WebM requires libvpx-vp9/libopus; MP4 requires libx264/aac. See [FFmpeg licensing](https://ffmpeg.org/legal.html) and [installation](node-export.md).

`@mediabunny/server` 1.61.3 uses NodeAV; the inspected NodeAV 6.1.1 binary reported statically linked FFmpeg 8.1-Jellyfin with GPL/version3 flags and x264/x265/fdk-aac. MIT metadata for the bindings does not license that binary. The integrated encoder is retained in an isolated opt-in entry with exact optional peers; no NodeAV binary is included or installed by default. GPL permits redistribution subject to its terms. Qualification remains blocked by the missing verified correspondence between this binary and its complete source, patches, build inputs and third-party licensing. Optional dependencies and external processes do not automatically exempt distributors from applicable obligations. `SKIP_FFMPEG=true` skips only the additional CLI downloader, not the addon libraries.

Primary references: [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0), [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/), [FFmpeg](https://ffmpeg.org/legal.html), [Mediabunny server](https://mediabunny.dev/guide/extensions/server), upstream package licenses and the lockfile. AETHER's Apache-2.0 license does not replace those terms.

For NodeAV 6.1.1, the inspected npm platform archive `@seydx/node-av-darwin-x64` contains only `package.json`, `README.md` and `node-av.node`, with no FFmpeg license text or corresponding source. The wrapper archive contains its MIT license. The [tagged build workflow](https://github.com/seydx/node-av/blob/v6.1.1/.github/workflows/build-prebuilds.yaml) builds static Jellyfin libraries and records a submodule; the tag pins `externals/jellyfin-ffmpeg` to `5cd65f8388fbcd2f87088d3b10fe53fc5ea81ed5`. This is useful source provenance, but does not establish all binary build inputs or satisfy source/notice obligations for a redistributed binary. macOS `otool -L` shows system/framework dependencies, no dynamic libav libraries, consistent with the runtime's static configuration. Other platform binaries were not inspected. See [tagged installer](https://github.com/seydx/node-av/blob/v6.1.1/src/ffmpeg/install.ts) and [FFmpeg license details](https://ffmpeg.org/doxygen/trunk/md_LICENSE.html).

A concrete compatibility question remains for GPL/version3 plus `libfdk-aac`: the pinned Jellyfin build applies [patch 0029](https://github.com/seydx/jellyfin-ffmpeg/blob/5cd65f8388fbcd2f87088d3b10fe53fc5ea81ed5/debian/patches/0029-remove-fdk-aac-from-nonfree.patch), which removes FDK AAC from configure's nonfree classification. This explains how the reported flags can coexist without `--enable-nonfree`; changing configure classification does not itself demonstrate redistribution rights. FFmpeg's official license document identifies FDK AAC as incompatible with GPL. Exact third-party rights/source/notice correspondence remain unestablished. OpenSSL requires checking its actual version: the pinned configure allows OpenSSL >=3 with GPLv3, while older OpenSSL differs; its enabled flag alone is insufficient to decide. This is a binary-specific blocker, not a statement that GPL prohibits publication. An alternative LGPL build would need actual codec capability, source/build correspondence and license verification before replacing the measured implementation; none is qualified here.
