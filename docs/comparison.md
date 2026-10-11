# Authoring model comparison

Primary documentation checked 2026-10-11. This compares authoring contracts, not pricing, quality, performance or commercial viability.

| Tool | Documented model | AETHER Fx's current distinction |
| --- | --- | --- |
| [Remotion](https://www.remotion.dev/docs/the-fundamentals) | React components receive a current frame; compositions specify dimensions, fps and duration. | AFX is bounded declarative data; it cannot execute arbitrary React/JavaScript. |
| [Motion Canvas](https://motioncanvas.io/docs/) | TypeScript generators program animations; an editor previews them. | AFX expands bounded reuse and evaluates absolute frame state without running generator code. |
| [Lottie](https://lottie.github.io/lottie-spec/latest/) | JSON format for animated vector graphics; the formal specification is still being standardized. | AFX is an authoring language and compiler with explicit contour/morph IDs. Lottie interchange is not implemented. |
| [Rive](https://rive.app/docs/editor/state-machine/state-machine) | Editor state machines connect animations through states, transitions and inputs. | AFX currently targets deterministic linear timelines and exports; interactive state-machine authoring is not implemented. |

Choose according to required authoring and runtime capabilities. No comparative benchmark, migration compatibility or superiority is established by this table.
