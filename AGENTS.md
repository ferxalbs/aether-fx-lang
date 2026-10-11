# Repository Guidelines

## Project Structure & Module Organization

AETHER Fx is a declarative 2D animation language and TypeScript runtime. Seven npm workspaces live in `packages/`: `core` (documents and deterministic evaluation), `compiler` (`.afx` parsing), `canvas`, `react`, `export` (browser video), `node` (native rendering), and `cli`. Source lives in each package’s `src/`; builds emit `dist/`.

`tests/` contains Vitest suites. `fixtures/` holds language examples and illustrated acceptance assets; `assets/` holds repository media. `examples/` contains browser, playground, and Next.js consumers. `scripts/` implements builds and acceptance checks; `docs/` describes language and API contracts.

## Build, Test, and Development Commands

Use Node.js >=22.12.0 and run commands from the repository root:

- `npm ci`: install pinned workspace dependencies.
- `npm run build`: build all packages and TypeScript declarations.
- `npm run typecheck`: check strict TypeScript types.
- `npm run lint`: check JS/TS syntax and JSON validity.
- `npm test`: run Vitest once against `tests/`.
- `npm run check`: validate release metadata, build, typecheck, and test.
- `node examples/browser/serve.mjs`: serve the browser demo at `http://127.0.0.1:3000` after building.
- `npm run verify:ci`: run full acceptance gates; requires Playwright browsers and external FFmpeg.

## Coding Style & Naming Conventions

Use ESM TypeScript, single quotes, semicolons, and two-space indentation for multiline blocks; match surrounding code. Use camelCase for functions/variables and PascalCase for types. Local TypeScript imports use `.js` extensions; use `import type` for type-only dependencies. Keep strict compiler settings. The repository uses a custom syntax linter, with no dedicated formatter configured.

Keep `core` platform-independent and evaluation deterministic by absolute frame. Consult `docs/architecture.md` and `CLAUDE.md` before changing package boundaries.

## Testing Guidelines

Tests import built package exports: rebuild after source changes. Extend the relevant `tests/*.test.ts` suite with descriptive `describe`/`it` cases. For focused checks, run `npm test -- tests/core.test.ts` or add `-t "test description"`. No numeric coverage threshold is configured; protect changed behavior and use relevant rendering/resource acceptance scripts for platform changes.

## Commit & Pull Request Guidelines

Recent commits use imperative, descriptive subjects, such as “Keep native render addons external in Next server builds.” Follow that style. Keep diffs focused. PRs should explain the behavior change, link relevant issues, and report exact verification commands/results. Include rendered evidence for visual changes and identify unverified platforms. Preserve dependency pins, asset provenance, and LICENSE/NOTICE obligations.
