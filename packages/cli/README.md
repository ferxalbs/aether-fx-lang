# @aether-fx/cli

Experimental ESM `afx` command for Node >=22.12. The same explicit Chromium and external FFmpeg prerequisites as `@aether-fx/node` apply; package installation downloads neither binary.

```sh
afx doctor
afx check 'my project/scene.afx'
afx compile 'my project/scene.afx' --out plan.json
afx render 'my project/scene.afx' --out scene.webm --width 1280 --height 720 --timeout 300000
```

`check` parses, resolves declared local assets, validates, and compiles. `compile` writes the canonical serializable plan. `render` outputs a JSON export report and accepts `--format webm|mp4`; WebM VP9/Opus is the reference format. Optional MP4 has no audiovisual acceptance claim yet. Errors are JSON on stderr with nonzero exit status. Unknown or repeated render options fail. Compile and render refuse to overwrite existing output. SIGINT/SIGTERM cancel rendering and release processes/files.

No public npm release has occurred. Original code is licensed under Apache-2.0; see LICENSE and NOTICE. npm scope ownership and publisher settings remain pending.
