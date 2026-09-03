# Hansol-100 Studio

📖 **English** · [한국어](README.ko.md)

**Process boards + Archify diagrams — one Agent Skill, one web service.**

Hansol-100 merges two diagram engines into a single product that works both as
an **Agent Skill** (Claude Code / Codex author the JSON) and as a **service**
(people browse, search, edit, export and share the results):

| | Engine | Input → Output |
|---|---|---|
| 🧭 | **Process boards** — the [korea100studio](https://github.com/hosungseo/korea100studio) swimlane renderer | `board-v1` JSON (lanes × stages × nodes × edges) → SVG · PNG · stage-reveal motion SVG, with a composition-quality audit |
| 🏗️ | **Archify** — vendored clean Skill package in [`engines/archify/`](engines/archify/) | Archify typed JSON (architecture · workflow · sequence · dataflow · lifecycle) → validated, interactive standalone HTML |
| 🌐 | **Studio service** — `hansol100 serve` | The `library/` folder of JSON files → web app with search, viewer, form/JSON editor, live preview, validation, export, trash/restore, and a JSON API |

Updates and fixes to the merged product happen here. Upstream Archify changes
are pulled in with one command (see [Updating the Archify engine](#updating-the-archify-engine)).

## Quick start

```bash
git clone https://github.com/evelynn/Hansol-100.git
cd Hansol-100
npm install                       # one dependency (ajv); everything else is plain Node ≥ 20
node bin/hansol.mjs doctor        # both engines present?
node bin/hansol.mjs serve --open  # http://127.0.0.1:4100/ with the sample library
```

Install as an Agent Skill so Claude Code / Codex pick up `SKILL.md`:

```bash
git clone https://github.com/evelynn/Hansol-100.git ~/.claude/skills/hansol100   # Claude Code
git clone https://github.com/evelynn/Hansol-100.git ~/.agents/skills/hansol100   # Codex
cd ~/.claude/skills/hansol100 && npm install && npm test
```

Then, in chat: *“Draw the permit approval process across applicant, clerk and
officer as a process board and add it to the library”* or *“Use Archify to map
this repository's runtime architecture.”* The Skill routes to the right engine,
validates, renders, audits and stores the result; the service shows it.

## Unified CLI (`node bin/hansol.mjs` / `hansol100`)

| Command | What it does |
|---|---|
| `render <file.json> [--out path] [--png] [--profile p] [--quality q] [--json]` | Detects the engine: boards → SVG (+PNG); Archify → atomic `deliver` to HTML with the receipt |
| `validate <file.json> [--strict] [--json]` | Boards: schema + references + layout (+ budget gate with `--strict`); Archify: `validate --json` |
| `audit <file.json> [--json]` | Composition metrics/score (boards) or the Archify receipt |
| `detect <file.json> [--json]` | Which engine/kind a file is, with a summary |
| `board <render\|audit\|validate\|motion\|check> …` | Verbatim korea100studio CLI (`scripts/board.mjs`) |
| `archify <render\|validate\|deliver\|guide\|compare\|…> …` | Verbatim Archify CLI (`engines/archify/bin/archify.mjs`) |
| `library list\|search\|add\|show\|remove\|export\|path` | Manage the service's content store (`library/`, `--library DIR`, `HANSOL_LIBRARY`) |
| `serve [--port 4100] [--host 127.0.0.1] [--library DIR] [--open]` | Start the studio service |
| `doctor` | Environment check (Node, engines, rasterizer, UI, library) |

`korea100studio …` remains available as a second bin for backwards compatibility.

## The service

`hansol100 serve` is a zero-dependency Node HTTP server (loopback by default;
`--host 0.0.0.0` to share on a LAN — there is no authentication).

- **Library** — cards with live SVG thumbnails, kind filters, sort, and search
  across titles, subtitles, lanes, stages, node labels, notes/refs and edge
  labels. Korean substrings match (e.g. `심판 재결`); several terms must all match.
- **Viewer** — boards with fit/zoom controls and stage-reveal motion playback;
  Archify diagrams in their own interactive viewer (theme, search, routes,
  stories, export) inside the page. Side panel with info, lanes/stages,
  composition metrics (boards) or the full 9-check validation receipt (Archify).
- **Editor** — boards: a form for basics, lanes, stages, nodes and edges
  (renames propagate, deletions cascade) *and* a JSON tab, both with live
  preview and composition chips; Archify: JSON with live preview and
  on-demand showcase validation. Save (`Ctrl/⌘+S`) uses optimistic
  concurrency: a stale save is refused, and you choose to overwrite or reload.
  Invalid drafts can be saved on purpose.
- **Create / import / export / trash** — templates for both engines,
  paste-or-upload import, JSON/SVG/PNG (rendered in the browser)/motion
  SVG/HTML export, soft delete with restore.
- **JSON API** — `/api/diagrams`, `/api/preview`, `/api/validate`, render
  endpoints and more, documented in [`docs/service.md`](docs/service.md), so
  agents and scripts can push results into a running studio.

## Engines

### Process boards (`board`)

Boards conform to [`schemas/board-v1.schema.json`](schemas/board-v1.schema.json):
`lanes` (actors) × `stages` (phases) × `nodes` (`{id, lane, stage, label,
emphasis, note, refs}`) × `edges` (`{id, source, target, type, label}`). Two
profiles: `default` (neutral English) and `gov` (korea100's Korean-government
look with 선행/핵심/병목/회귀 badges and 조문 references). `audit` scores the real
routed geometry — `nodePiercings` must be 0; crossings, bends, route stretch
and adjusted labels are soft budgets. See
[`references/authoring.md`](references/authoring.md),
[`references/composition-quality.md`](references/composition-quality.md),
[`references/profiles.md`](references/profiles.md).

PNG output uses `rsvg-convert`, `cairosvg`, or any Chrome/Chromium
(`HANSOL_CHROME=/path/to/chrome`); SVG never needs anything. The web UI exports
PNG in the browser without any of them.

### Archify (`archify`)

`engines/archify/` is the clean Archify Skill package (the exact file set
`archify.zip` ships: no tests, no lockfile, no dev tooling) plus
`VENDOR.json` recording the upstream commit. Everything Archify documents in
[`engines/archify/SKILL.md`](engines/archify/SKILL.md) works unchanged —
`validate`, `deliver`, `preview`, `compare`, `visual-check`, `guide`,
`brands`, `migrate`. The service renders Archify HTML on demand and shows the
validation receipt; the CLI's engine-neutral `render`/`validate` use Archify's
own `deliver --json` / `validate --json`.

## Updating the Archify engine

```bash
node scripts/sync-archify.mjs --from ../archify           # stage the clean package from a checkout, update engines/archify, write VENDOR.json
node scripts/sync-archify.mjs --from ../archify --check   # exit 1 if engines/archify drifted from that checkout
npm test                                                  # engine smoke tests: doctor, per-type validation, render + check, SKILL path integrity
```

The sync uses Archify's own `scripts/stage-clean-skill.mjs`, so the vendored
tree is byte-identical to Archify's distribution. See
[`docs/sync-archify.md`](docs/sync-archify.md).

## Repository layout

```
SKILL.md                  unified Skill entry point (routes to both engines + the service)
bin/hansol.mjs            unified CLI
scripts/board.mjs         korea100studio CLI (unchanged)
scripts/lib/              board engine (layout, render, composition, motion, profiles) + shared libs
                          (detect, archify-engine, library/search, rasterize)
scripts/server/           the service: server.mjs (HTTP + API) and ui/ (vanilla JS web app)
scripts/sync-archify.mjs  Archify vendoring script
engines/archify/          vendored Archify Skill package + VENDOR.json
library/                  the service's content store (sample boards + Archify diagrams)
schemas/ templates/ references/ fixtures/   board-v1 contract, starters and docs
docs/                     architecture, service/API, sync procedure, original design notes
tests/                    node:test suites (engine, CLI, library, server, optional browser)
```

## Tests

```bash
npm test                                             # ~100 tests, no browser needed
NODE_PATH=$(npm root -g) node --test tests/ui.browser.test.mjs   # optional: real-browser UI flow with a globally installed Playwright
```

## Credits and licenses

- Process-board engine: [korea100studio](https://github.com/hosungseo/korea100studio) by Hosung Seo (MIT), the base of this repository — see [`LICENSE`](LICENSE).
- Archify: [tt-a1i/archify](https://github.com/tt-a1i/archify) (MIT; based on Cocoon AI's architecture-diagram-generator) — vendored with its own `LICENSE` and `THIRD_PARTY_NOTICES.md` under `engines/archify/`.
- See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
