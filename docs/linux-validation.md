# Linux validation of the v0.2 source snapshot

The first hosted execution failed; the subsequent verifier corrections are prepared locally, not qualified by another hosted run. This is not release approval. RC.3 archives belong to `04eceeb`; they do not include `d65a91d` or subsequent CI changes. Fresh CI tarballs are temporary consumer-test inputs with their own hashes, not replacements for the immutable RC.3 archives. The measured macOS export speed remains FAIL; Ubuntu timings do not qualify that reference host.

## Workflow and encoder

`.github/workflows/ci.yml` runs on Ubuntu 24.04 with Node 22.12.0/24.21.0 and npm 11.19.0. It accepts pull requests, manual dispatch, and pushes to `main` or `codex/aether-fx-v0.2-public-ci`. Pushing that candidate branch therefore executes its own updated workflow, without first updating main. Manual dispatch requires a dispatchable workflow on the default branch; use `--ref codex/aether-fx-v0.2-public-ci` and verify the resulting `headSha`.

`scripts/ci-install-ffmpeg.sh` builds checksum-pinned FFmpeg 8.0.1 using Ubuntu libvpx/libopus/libx264 development packages. It enables GPL/libx264 and checks `libvpx-vp9`, `libopus`, `libx264` and `aac` before acceptance. The GPL-enabled executable is installed only in the disposable runner. Logs record FFmpeg configuration, Ubuntu codec versions and host CPU/memory; binary files and libraries are not uploaded or added to workspace tarballs. This does not change AETHER's Apache-2.0 license. See [FFmpeg licensing](https://ffmpeg.org/legal.html).

## Independent evidence and assembly

The acceptance job runs all existing gates, preserving failures and continuing independent checks. Its report separates functional results from distribution checks and numeric bundle failures only after import-graph isolation passes. The overall acceptance still fails if any original gate fails. An assembly failure in the separate job cannot prevent acceptance reports from being uploaded.

After acceptance, `node scripts/benchmark-native-candidate.mjs artifacts/native-benchmark` generates three sequential 20s/720p/24fps native exports, independent decode reports and a stage profile from `fixtures/short/little-light.afx` and its versioned assets. Codec, quality, audio and dimensions match the reference workload. No historical/private benchmark files are required. Partial failures retain prior observations; fresh directories prevent mixing runs.

The assembly job downloads the matching Node job's generated reports, workspace dist modules and seven tested archives. It runs `prepare-candidate.mjs --out artifacts/linux-validation-<run-id>-node-<version>` independently, checking acceptance source hashes, emitted modules and consumer/archive correspondence. The snapshot stays explicitly unapproved even when assembly succeeds. Linux performance is labeled `NOT_QUALIFIED_REFERENCE_HOST`, with raw measurements retained; this is not a relaxation of the macOS target. Missing evidence, an explicit failed report or incomplete/failed acceptance blocks assembly before creating a candidate. `artifacts/assembly/diagnostic.json` distinguishes `REPORT_MISSING`, `REPORT_FAILED` and `ACCEPTANCE_FAILED`; the workflow uploads assembly diagnostics and step outcomes even when no candidate directory exists.

## Execution after review and authorization

Publish only the reviewed clean snapshot branch, not the original development branch or all tags. Its exact commit/tree/file inventory is part of the separate local review delivery. It has no development ancestors. Original local history and RC.3 tags remain preserved. A new clean branch does not remove information already present in other remote refs/history; normal PR merging with an unrelated root requires a separate integration decision.

For automatic execution, push only `refs/heads/codex/aether-fx-v0.2-public-ci` after authorization. No dispatch is necessary. Alternatively:

```sh
gh workflow run ci.yml --repo ferxalbs/aether-fx-lang --ref codex/aether-fx-v0.2-public-ci
```

A collaborator needs permission to push the new branch. HTTPS fine-grained credentials need Contents:write and Workflows:write for the workflow files; manual dispatch additionally needs Actions:write. The jobs retain `contents: read`; npm publication/deployment credentials are unnecessary. Verify exact `headSha`, both Node jobs, each per-gate result and artifact hashes. Keep all FAIL results; a hosted job is not a performance result on the macOS reference host. [GitHub manual execution](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## First hosted execution and scoped corrections

[Run 38168445048](https://github.com/ferxalbs/aether-fx-lang/actions/runs/38168445048) tested `fbe8745`: both Node versions executed 29 gates, with 25 PASS and four FAIL (bundles, Next preview advance, WebKit Opus sample coverage and ANSI parsing in release verification). Both assembly jobs failed on the missing Next report; their upload step then failed because no candidate directory existed. All original results and artifacts remain historical evidence.

The Next verifier now records player state/clock, audio resume operations, visibility, RAF gaps and evaluated/drawn frames in the isolated consumer. It awaits actual drawn-frame advancement with a five-second failure deadline and observes ten RAF callbacks after Pause to verify no further frame/draw advancement. A controlled pending resume reproduces the former fixed-wait failure while verifying cancellation; a delayed resume exercises the condition-based check. This establishes a scheduling-sensitive test expectation, not the exact startup latency of the earlier Linux runner. The runtime API is unchanged.

Release verification uses the pinned Vitest 5.0.3 JSON reporter plus process exit status, suite/file/assertion inventories and counts; it exercises real failing tests, import-time errors and incomplete reports. Next, browser export, independent video decode and release verification retain explicit PASS/FAIL diagnostic reports on failure. Assembly remains blocked by failed acceptance, including unchanged bundle gates; diagnostic upload does not make a candidate or turn a failure green.
