# Known limitations

- Browser codec support is probed on the actual device/configuration; headless WebCodecs support is not guaranteed by browser name.
- Native browser AAC has observed onset/metadata failures. The optional AAC WASM entry is separate from the default dependency graph; independent decode is required.
- Default Node video export uses Skia and requires separately installed FFmpeg. Chromium is an explicit compatibility renderer. The integrated encoder is opt-in with binary distribution unqualified. MP4 needs libx264/aac, while WebM needs libvpx-vp9/libopus.
- Fonts, native shaping and anti-aliasing may produce different pixels across backends/platforms. Exact state determinism does not imply cross-platform PNG equality.
- Preview has historical intermittent dropped-frame/timeout failures whose root cause is unresolved. Instrumented subsequent passes do not establish their repair.
- Full gradient/shadow parity, text layout/reveal, multi-track audio, clipping and blend-mode features are not part of this candidate.
- Bundle budgets and hosted/physical-device qualification are tracked in [readiness](RELEASE-READINESS.md).
