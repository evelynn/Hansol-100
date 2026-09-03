---
name: hansol100
description: >-
  All-in-one diagram studio. (1) Turn any process — actors × stages × steps,
  described in natural language, a table, or data — into a vertical swimlane
  process board (SVG, optional PNG, stage-reveal motion SVG) and audit its
  composition quality. (2) Create validated Archify architecture, workflow,
  sequence, data-flow and lifecycle diagrams as interactive standalone HTML.
  (3) Keep every diagram in a searchable, editable, shareable web library
  (`hansol100 serve`) so people can refine what the agent produced. Use when
  the user wants to visualize a workflow, procedure, approval flow,
  who-does-what-when, system architecture, API call sequence, data pipeline,
  or state lifecycle — or wants to browse, search, edit, or share diagrams
  already made. Works in Claude Code and Codex.
---

# Hansol-100 Studio

One Skill, two engines, one service:

| Engine | Input | Output | Best for |
|---|---|---|---|
| **board** (korea100studio) | `board-v1` JSON: `lanes` × `stages` × `nodes` × `edges` | SVG (+PNG, motion SVG) | Business/administrative procedures, approval flows, who-does-what-when across actors and phases |
| **archify** (vendored at `engines/archify/`) | Archify typed JSON (`diagram_type`) | Interactive standalone HTML | System architecture, technical workflows/runbooks, API sequences, data pipelines, state lifecycles |
| **service** (`hansol100 serve`) | The `library/` folder of JSON files | Web app + JSON API | Browsing, searching, editing, exporting and sharing everything above |

All commands run from the skill root: `node bin/hansol.mjs <command>` (aliased
as `hansol100` when installed with npm). Run `node bin/hansol.mjs doctor` once:
it says which Archify is in use (vendored `engines/archify`, an external
install via `HANSOL_ARCHIFY_ROOT`, or a discovered Skill install) or that the
product is in **board-only mode** (no Archify: boards, library, service and
workflow → board conversion still work; report Archify requests as
unavailable instead of improvising).

## 1. Pick the engine

- Actors/roles/departments moving a case through ordered phases, Korean
  administrative or legal procedures, anything the user calls a 순서도/업무
  흐름/절차/swimlane → **board**.
- Components, services, infrastructure, request/response sequences, ETL,
  state machines, anything about code or systems → **archify**; choose the
  type with the router in `engines/archify/SKILL.md`, or ask
  `node bin/hansol.mjs archify guide "<scenario>" --json`.
- The user wants to see, find, fix, or share existing diagrams → **service**
  (§4). Anything the agent creates should also be added to the library (§4)
  unless the user only wants a file.

## 2. Process boards (board engine)

1. **Elicit the process.** Identify `lanes` (actors, left→right in handoff
   order), `stages` (ordered phases, top→bottom), `nodes` (one card per
   actor-action in a stage: `{id, lane, stage, label, emphasis?, note?, refs?}`)
   and `edges` (`sequence` = normal flow, `message` = information handoff
   between lanes, `loop` = rework/return path). Mapping guidance and a worked
   example: `references/authoring.md`. Field reference:
   `schemas/board-v1.schema.json`. Starters: `templates/board.template.json`,
   `fixtures/generic-sample.json` (default profile), `fixtures/gov-sample.json`
   (Korean `gov` profile with statute `refs`).
2. **Write the JSON.** Use `"profile": "gov"` for Korean administrative/legal
   procedures (badges 선행/핵심/병목/회귀, `refsLabel` 조문); omit it for the
   neutral English `default` profile. Details: `references/profiles.md`.
3. **Validate → render → audit, then iterate:**

   ```bash
   node bin/hansol.mjs validate board.json            # schema + references + layout (exit 1 on error)
   node bin/hansol.mjs render board.json --out board.svg [--png]
   node bin/hansol.mjs audit board.json               # composition metrics + score
   node bin/hansol.mjs board motion board.json --out board.motion.svg
   ```

   `nodePiercings` must be 0 (an edge hidden behind an unrelated card). The
   other metrics are soft budgets; repeated violations mean simplify the graph
   (fewer cross-lane edges, shorter loops, reorder stages) rather than tolerate
   the render. Thresholds and fixes: `references/composition-quality.md`.
   `validate --strict` fails on any budget violation (use in CI).
4. PNG is emitted when `rsvg-convert`, `cairosvg`, or a Chrome/Chromium binary
   (`HANSOL_CHROME=/path/to/chrome`) is available; SVG is always produced. The
   web UI can also export PNG from the browser without any of those.

`node bin/hansol.mjs board <render|audit|validate|motion|check> …` passes
through to the original korea100studio CLI (`scripts/board.mjs`) unchanged.

## 3. Archify diagrams (archify engine)

Read `engines/archify/SKILL.md` and follow its **fast authoring path** exactly
(one schema + one example, artifact first, `validate` after every edit,
`deliver` for acceptance). Every command there is available in two equivalent
forms:

```bash
node bin/hansol.mjs archify validate workflow candidate.json --quality showcase --json
node bin/hansol.mjs archify deliver workflow candidate.json out.html --quality showcase --json
# or, exactly as upstream documents it:
cd engines/archify && node bin/archify.mjs validate workflow ../../candidate.json --quality showcase --json
```

Schemas live in `engines/archify/schemas/`, examples in
`engines/archify/examples/`, references in `engines/archify/references/`.
The engine-neutral shortcuts also work: `node bin/hansol.mjs validate
diagram.json` and `node bin/hansol.mjs render diagram.json --out out.html`
detect `diagram_type` and run Archify's `validate --json` / `deliver --json`.
A non-zero exit is never success; report the diagnostics' `subject`,
`evidence` and `supportedFixes` truthfully.

## 3b. Both at once: convert between the engines (synergy)

When the user wants the same process as a print/government-style board *and*
as an interactive Archify diagram, author it once and convert:

```bash
node bin/hansol.mjs convert board.json --to workflow [--out board.workflow.json] [--quality standard|showcase]
node bin/hansol.mjs convert diagram.workflow.json --to board [--profile gov]
```

The converter keeps lanes, stages (≤ 6 → columns), nodes, emphasis (legend
relabelled in board terms), notes/refs (sublabel/tag) and edge types
(sequence/message/loop ↔ default/async/return), fits Archify's single-line
text rules (over-long text is shortened and preserved in `cards`), stacks
same-cell nodes, and routes long returns above the lanes; the result is
validated with the target engine and the command exits 1 if it does not pass
(the file is still written so you can repair it). Review the converted file
like any authored document: `validate`, then `render`/`deliver`, then
`library add`. A board with more than 6 stages must be merged first — say so
rather than dropping stages. Boards with many crossings pass the `standard`
Archify profile with warnings; `showcase` may report crossings that need
manual `via`/routing work.

## 4. Library and service (make it browsable, editable, shareable)

The library is a folder of JSON files (`library/` by default; override with
`--library <dir>` or `HANSOL_LIBRARY`). Both engines' documents are detected
automatically.

```bash
node bin/hansol.mjs library add board.json [--id my-process]   # validates, then stores as library/<id>.json
node bin/hansol.mjs library list
node bin/hansol.mjs library search "심판 재결"                 # title/lanes/stages/nodes/notes, all terms must match
node bin/hansol.mjs library export <id> --out ./dist [--png]   # json + svg + motion svg (board) or html (archify)
node bin/hansol.mjs serve --open                               # http://127.0.0.1:4100/
```

The web app lets people browse and search the library, view boards (with
motion playback) and Archify HTML, edit boards in a form (lanes, stages,
nodes, edges, refs) or raw JSON with live preview and composition metrics,
edit Archify JSON with live preview and the full validation receipt, save with
conflict detection (another editor's save is never silently overwritten),
duplicate, export (JSON/SVG/PNG/motion/HTML), and restore from trash. Add
`--host 0.0.0.0` to share it on a network — there is no authentication, so
treat it as a team-internal tool. The JSON API (`/api/…`, documented in
`docs/service.md`) accepts the same documents, so an agent can push results
into a running service with `curl` as well.

Typical end-to-end run: author JSON → validate/render/audit until clean →
`library add` → tell the user the id, the rendered file path, and that
`hansol100 serve --open` (or the already running service) shows it.

## 5. Output

Report: engine and kind, the rendered file path(s), the validation/audit
summary (board: score + `nodePiercings`; archify: artifact checks and
composition status from the receipt), the library id when stored, and any
unresolved diagnostics. Never claim a render or validation you did not run.

## Reference files

- `references/authoring.md` — natural language → `board-v1` mapping with a worked example.
- `references/composition-quality.md` — what `audit` measures and the budgets.
- `references/profiles.md` — `default` vs `gov`, and how to add a profile.
- `schemas/board-v1.schema.json`, `templates/board.template.json`, `fixtures/*.json`.
- `engines/archify/SKILL.md` and `engines/archify/references/*.md` — the complete Archify contract.
- `docs/service.md` — service usage and JSON API; `docs/architecture.md` — how the pieces fit.
