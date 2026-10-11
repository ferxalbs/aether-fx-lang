# Licensing and publication identity

Original AETHER Fx code, documentation and original fixture assets use Apache-2.0, as explicitly authorized by the owner on 2026-10-10. The complete official Apache License is preserved in LICENSE. NOTICE records the supplied attribution verbatim:

> Copyright 2026  Fer's

The build copies the same LICENSE and NOTICE into all seven packages, and each package includes them in its npm file allowlist. This choice replaces the initial provisional ISC declaration for original work. It does not relicense third-party dependencies, fonts or external binaries.

The actual configured Git remote is https://github.com/ferxalbs/aether-fx-lang.git. Package repository metadata uses that URL with the correct workspace directory; homepage and issues links are derived from it. The intended npm scope is @aether-fx. Public registry probes for all seven package names returned 404 on 2026-10-10. That does not establish scope availability or ownership. `npm whoami --registry=https://registry.npmjs.org/` returned ENEEDAUTH; account permissions, organization membership and trusted-publisher configuration remain unverified. No account registration, permission change or publication was performed.

## Runtime dependency inventory

This table records the resolved root lockfile's runtime/peer dependency metadata, including transitive dependencies. Public package builds keep third-party imports external; the dependencies' own npm packages retain their complete LICENSE/NOTICE files. Those files are not replaced by the AETHER Fx license. Mediabunny remains MPL-2.0 software; its installed source is unchanged. The original project's package artifacts contain no third-party binary or demonstration font.

| Dependency | Version | Declared license |
| --- | --- | --- |
| @chevrotain/cst-dts-gen | 13.2.0 | Apache-2.0 |
| @chevrotain/gast | 13.2.0 | Apache-2.0 |
| @chevrotain/regexp-to-ast | 13.2.0 | Apache-2.0 |
| @chevrotain/types | 13.2.0 | Apache-2.0 |
| @chevrotain/utils | 13.2.0 | Apache-2.0 |
| @types/dom-mediacapture-transform | 0.1.12 | MIT |
| @types/dom-webcodecs | 0.1.13 | MIT |
| chevrotain | 13.2.0 | Apache-2.0 |
| mediabunny | 1.61.3 | MPL-2.0 |
| playwright | 1.64.0 | Apache-2.0 |
| playwright-core | 1.64.0 | Apache-2.0 |
| react | 19.3.0 | MIT |

Development dependencies and platform-specific optional tools remain recorded separately in package-lock.json; they are not included as binaries in the public tarballs. The private Next example uses Next 16.4.0 and ReactDOM 19.3.0, both MIT, with its resolved dependency inventory in examples/next-app/package-lock.json. Their installed licenses are preserved.

## Reference assets and external tools

Nunito is Copyright 2014 The Nunito Project Authors and uses SIL Open Font License 1.1. The original, complete assets/Nunito-OFL.txt is preserved alongside the unmodified TTF; fixture manifest hashes continue to identify the exact font/image/WAV bytes. See fixtures/short/ASSETS.md for sources and provenance. The original PNG, score and geometry now follow Apache-2.0 and the supplied notice.

Chromium/Firefox/WebKit and FFmpeg are deliberate local tooling requirements, not redistributed in npm tarballs. Their independent licenses and upstream notices remain applicable to their distributions. This inventory records attribution and packaging facts; npm scope authority and OIDC publisher settings must be confirmed separately before a future authorized publication.

Sources: [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt), installed package manifests/licenses and the committed lockfiles; [npm whoami](https://docs.npmjs.com/cli/v11/commands/npm-whoami/) explains the authenticated account check.
