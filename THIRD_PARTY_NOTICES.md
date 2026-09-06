# Third-party notices

Hansol-100 combines two MIT-licensed projects and adds the unified CLI, the
library, the web service and the documentation on top of them.

## korea100studio (process-board engine)

`scripts/board.mjs`, `scripts/lib/{layout,render-svg,composition,motion,profiles,rasterize,validate}.mjs`,
`schemas/`, `templates/`, `references/`, `fixtures/` and the original tests
come from [korea100studio](https://github.com/hosungseo/korea100studio),
Copyright (c) 2026 Hosung Seo, MIT License. This repository is a fork of it;
the root [`LICENSE`](LICENSE) is that license.

## Archify (typed diagram engine)

`engines/archify/` is the unmodified clean Skill package of
[Archify](https://github.com/tt-a1i/archify), Copyright (c) 2026 tt-a1i
(Archify) and Copyright (c) 2025 Cocoon AI, MIT License. The package carries
its own [`LICENSE`](engines/archify/LICENSE) and
[`THIRD_PARTY_NOTICES.md`](engines/archify/THIRD_PARTY_NOTICES.md); the latter
records the provenance and known terms of the optional brand marks (Simple
Icons 16.28.0 under CC0 1.0, plus individually licensed marks such as Angular,
Apache Airflow/Kafka, .NET, JavaScript, Jenkins, Rust, Vue.js and the OpenAI
mark). Those terms apply unchanged when the marks are rendered through
Hansol-100. `engines/archify/VENDOR.json` records the exact upstream commit.

## Runtime dependency

- [ajv](https://github.com/ajv-validator/ajv) — MIT — JSON Schema validation
  for `board-v1` documents (optional at runtime; a built-in validator covers
  the same contract when ajv is not installed).
