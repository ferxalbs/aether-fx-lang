# @aether-fx/cli

Experimental ESM `afx` command for Node >=22.12. The same external FFmpeg prerequisites as `@aether-fx/node` apply; package installation downloads neither binary.

```sh
afx doctor
afx check 'my project/scene.afx'
afx compile 'my project/scene.afx' --out plan.json
afx render 'my project/scene.afx' --out scene.webm --width 1280 --height 720 --timeout 300000
```

`check` parses, resolves declared local assets, validates, and compiles. `compile` writes the canonical serializable plan. `render` outputs a JSON export report and accepts `--format webm|mp4`; WebM VP9/Opus is the reference format. MP4 requires libx264/aac and actual environment/decode checks. Errors are JSON on stderr with nonzero exit status. Unknown or repeated render options fail. Compile and render refuse to overwrite existing output. SIGINT/SIGTERM cancel rendering and release processes/files.

No public npm release has occurred. Original code is licensed under Apache-2.0; see LICENSE and NOTICE.

The local 0.2 candidate adds `check --json`, `fix --safe`, `fmt`, `expand`, `scene`, `hash`, `bench`, `probe` and `lsp`. `render` defaults to Skia with external FFmpeg. `--format mp4` requires successful codec probes. Scene generation includes a licensed bundled Nunito font; it validates generated sources against the actual copied font bytes. Formatting omits comments, safe fixes never guess intent, and outputs refuse overwrite.
