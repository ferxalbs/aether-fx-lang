# AETHER Fx documentation

AETHER Fx turns declarative `.afx` animation source into a plan that can be evaluated, played and exported. Version 0.1.0 is experimental and unpublished; the guides start from a local checkout.

## Start here

1. Follow the [quickstart](quickstart.md) to run the illustrated demo, inspect a frame and export WebM.
2. Read the [language guide](language-v0.md) to write shapes, parts, actors and shots.
3. Use the [API reference](api.md) when integrating the packages into an application.

## Find a task

| I want to… | Read |
| --- | --- |
| Try the included animation | [Quickstart](quickstart.md#preview-the-included-animation) |
| Write my first `.afx` project | [README example](../README.md#what-the-language-looks-like) and [language guide](language-v0.md) |
| Compile source or inspect a frame | [Quickstart](quickstart.md#compile-and-evaluate-a-frame) and [API](api.md) |
| Embed playback in React or Next.js | [React/Next integration](react-next.md) |
| Render video with Node or the CLI | [Node export and diagnosis](node-export.md) |
| Export video inside a browser | [Browser preview and export](browser-export.md) |
| Install the unpublished packages elsewhere | [Local archives](quickstart.md#install-local-packages-in-another-project) |
| Understand a failure or support limit | [Known issues](../KNOW-ISSUES.md) |
| Check licenses or asset provenance | [Licensing](licensing.md) and [example assets](../fixtures/short/ASSETS.md) |

## Maintainer references

These documents describe implementation, measurements and acceptance work. They are separate from the usage guides.

- [Architecture](architecture.md): package boundaries, contracts and historical implementation evidence.
- [Performance](performance.md): measured results, methodology and limits.
- [Release preparation](release.md): package identity, archives, checks and publication prerequisites.
- [Release readiness](../RELEASE-READINESS.md): latest recorded local and hosted acceptance results.
- [Changelog](../CHANGELOG.md): prepared versions and changes.
- [Visual history](history-of-lang.md): early renders of the included short.

For current status, use release readiness and known issues. Older milestone reports describe the checks performed at that point; they do not establish that the latest revision passed hosted CI.
