# Changelog

All notable changes to Hansol-100 are documented here. Versions follow
[semver](https://semver.org/). Entries before 1.0.0 are korea100studio's.

## [1.0.0] - 2026-09-03

Hansol-100 Studio: korea100studio (process boards) + Archify (typed diagrams)
merged into one Skill + service.

### Added
- **Archify engine** vendored at `engines/archify/` (clean Skill package,
  byte-identical to Archify's distribution, `VENDOR.json` provenance) and
  `scripts/sync-archify.mjs` to update it from an Archify checkout (`--check`
  detects drift).
- **Unified CLI** `bin/hansol.mjs` (`hansol100`): engine-detecting `render`,
  `validate`, `audit`, `detect`; verbatim `board …` and `archify …`
  pass-throughs; `library list|search|add|show|remove|export|path`; `serve`;
  `doctor`.
- **Library** (`scripts/lib/library.mjs`): one JSON file per diagram, lazy
  mtime-based index, Korean-friendly weighted substring search with match
  snippets, revision-based optimistic concurrency, soft delete/restore.
- **Service** (`scripts/server/server.mjs`, zero dependencies): JSON API for
  listing/searching, CRUD with conflict detection, per-engine render endpoints
  (SVG, motion SVG, PNG, HTML) with ETags, unsaved-document preview and
  validation, templates, trash. Loopback by default, CSP on the UI, body limits.
- **Web UI** (`scripts/server/ui/`, vanilla ES modules): library with
  thumbnails/filters/search, viewer (zoom, motion, Archify iframe, metrics or
  validation receipt, exports incl. browser-side PNG), editor (board form with
  rename propagation and cascading deletes + JSON tab, live preview and
  composition chips; Archify JSON + live preview + showcase validation),
  conflict/invalid-draft handling, import, trash, Korean/English UI.
- Chrome/Chromium headless PNG rasterization fallback (`HANSOL_CHROME`).
- Built-in `board-v1` validator used when ajv is not installed.
- Sample `library/` with two boards and five Archify diagrams; unified
  `SKILL.md`; docs (`docs/architecture.md`, `docs/service.md`,
  `docs/sync-archify.md`); `THIRD_PARTY_NOTICES.md`.
- Tests for the vendored engine, CLI, library/search, server API, validator
  parity, and an optional real-browser UI flow (Playwright).

### Changed
- Package renamed to `hansol-100` 1.0.0 with bins `hansol100` and
  `korea100studio` (compatibility). Node ≥ 20. CI matrix 20/22/24.

## [0.1.2] - 2026-07-21 (korea100studio)

### Added
- Referential-integrity validation — `render`, `audit`, `validate`, and `motion`
  now report exactly which node references an unknown lane/stage, which edge has
  a dangling endpoint, and any duplicate node/edge id, instead of a raw layout
  error. Exposed programmatically as `checkReferentialIntegrity(board)`.
- `korea100studio --version` (`-v`).

## [0.1.1] - 2026-07-21 (korea100studio)

### Fixed
- `default` profile footer no longer carries the Korean-government disclaimer
  ("Not legal advice…"); it now reads a neutral, domain-agnostic note. The `gov`
  profile keeps its original disclaimer.

### Added
- `audit --json` — machine-readable composition metrics (score, metrics,
  violations) for CI and programmatic use.

## [0.1.0] - 2026-07-20 (korea100studio)

Initial release. Standalone Agent Skill (Claude Code + Codex) that turns any
process (lanes × stages × nodes × edges) into a vertical swimlane board.

- Render `board-v1` JSON to SVG (optional PNG via rsvg-convert / cairosvg)
- Composition-quality audit (node-piercings, crossings, bends, route stretch)
- Stage-ordered reveal animation as a self-contained SMIL SVG
- `default` (neutral) and `gov` (korea100 Korean-government) profiles
- CLI: `render` / `audit` / `validate` / `motion` / `check`
- Faithful port of korea100's renderer — the `gov` profile reproduces korea100's
  composition metrics bit-for-bit across all 509 boards (verified)
