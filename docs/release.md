# Build and package verification

The joint package scope/version are in `release.config.json`; document/plan schema versions are independent. The seven packages are ESM and require Node >=22.12.0. See [readiness](../RELEASE-READINESS.md) for technical gates and [licensing](licensing.md) for dependency terms.

```sh
npm ci
npm run check
node scripts/verify-package-metadata.mjs
npm run verify:ci
node scripts/benchmark-native-candidate.mjs artifacts/native-benchmark
node scripts/prepare-candidate.mjs --out artifacts/review-snapshot
```

Use a new release version/directory for a changed candidate; existing tags and immutable release directories must not be overwritten. `release:sync` synchronizes scope/version and `release:check` rejects drift. Metadata verification inspects seven real tarballs, declared exports, exact LICENSE/NOTICE and the bundled font/OFL.

Acceptance runs each independent check once, records PASS/FAIL and continues after a failed gate. It includes isolated consumers, frame/decode checks, resource lifecycle, parser corpus, bundles and benchmarks. Reports record exact source/build/archive hashes and tool/platform versions. Local tests, hosted Linux execution and physical-device coverage are separate facts. A green example is not a measured model-generation result.

The assembler copies an explicit public documentation/evidence allowlist, seven archives and their SHA256 checksums. It excludes local session records, authentication/account reports, provider responses and internal documents. The manifest records source hashes, tool versions and technical gates. A failed mandatory gate keeps technical approval false. Packaging does not establish publication readiness.

The prepared Ubuntu workflows use Node 22.12.0/24.21.0, Playwright 1.64.0 and externally built FFmpeg 8.0.1 with libvpx/libopus/libx264 and native AAC. All four encoders are checked before acceptance; the GPL-enabled CI build is not included in package archives. Acceptance evidence and snapshot assembly use separate jobs; see [Linux preparation](linux-validation.md). Workflow syntax checks do not prove a hosted run.

For a Node transport-only correction after a comprehensive run, `node scripts/verify-ci.mjs --distribution` executes the affected build, bundle, lifecycle, archive-consumer and independent Node decode gates. Its report declares `scope: distribution`; it is not a complete language/authoring rerun. Retained reports qualify only their actual source artifacts; the manifest records hashes unchanged from the earlier comprehensive run. Fresh native benchmark inputs are generated from versioned sources. Historical acceptance and RC.3 checksums qualify only their original snapshots, never new tarballs.
