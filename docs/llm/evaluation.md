# Evaluation protocol

The frozen prompts are `scripts/eval/prompts.json`: 40 total, 30 dev/10 held-out, fixed before templates. The split is declared in the prompt corpus. This small split is not conclusive statistical evidence.

`node scripts/eval/harness.mjs recorded [config.json]` is the CI-safe mode. It calls no provider. Config can select a recordings file with objects `{promptId,attempt,source,usage,snapshot,requestId}`. Without genuine provider captures it records zero attempts, no model and no generation rates. Constructed fixtures/examples only test replay/check plumbing and cannot measure model generation.

Live mode uses a user-selected OpenAI-compatible endpoint/protocol. It is not fixed to any vendor/model. Config requires `authorizedPaidRun:true`, `maxCostUSD`, `model`, `endpoint`, `keyEnv`, `inputUSDPerMillion`, `outputUSDPerMillion`; additionally declare `priceDate`, `maxOutputTokens`, output directory, split and optional `assetManifest` for declared assets. No live model-generation metrics are supplied with this candidate.

Each prompt gets one attempt and at most three repairs from structured JSON diagnostics. Before each call, the harness checks a conservative UTF-8 byte/token allowance plus message overhead and the configured maximum output against the remaining priced budget. It stores prompt text/hash, source/hash, model snapshot/request ID, config, pack/prompt hashes, real provider usage, measured live latency and usage-priced cost after each attempt. Partial/error checkpoints retain completed attempts when a later request/budget check fails. Usage-priced cost is not a verified provider invoice; failed requests with missing usage remain unknown.

Asset manifests must identify real declared bytes. Compiler success alone does not prove render, readability or aesthetics. The separate authoring/template checks render 0/25/50/75/final frames, compare rerenders and measure applicable content/bounds/local contrast. These authored scenes are not provider results. A generic automatic aesthetic scorer is not implemented. Live first-pass/repair rates, compiled-scene quality rates, dev/held-out gap, latencies and spend remain **NOT MEASURED**; no 80/95/90% target is claimed.

| Date | Mode | Model/snapshot | Attempts | Generation rates | Usage-priced cost |
| --- | --- | --- | ---: | --- | --- |
| 2026-10-11 | recorded, no captures | none | 0 | unmeasured | unmeasured |

Run baseline, post-language and post-templates evaluation with a declared provider/model/configuration, preserving each pack/config and its hashes. A changed model/configuration is a confounder. Declare visual exceptions before a run and keep visual human/model review separately labeled. Do not tune on held-out outputs or turn replay/estimates into live evidence.
