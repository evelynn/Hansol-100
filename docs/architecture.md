# Hansol-100 architecture

Hansol-100 is one repository that behaves as an **Agent Skill** and as a
**service**, sharing one source of truth: JSON documents.

```
                 ┌──────────────────────────────────────────────────────────┐
  agent / human  │  SKILL.md  ─►  bin/hansol.mjs (unified CLI)              │
                 │                 │        │           │                    │
                 │                 ▼        ▼           ▼                    │
                 │   scripts/board.mjs   engines/archify/   scripts/lib/library.mjs
                 │   (board engine)      (Archify CLI +    (JSON store, index,
                 │   layout · render     renderers, run    search, revisions,
                 │   composition·motion  via archify-      trash)
                 │                       engine.mjs)         │
                 │                                            ▼
                 │            scripts/server/server.mjs  ◄──  library/*.json
                 │            (HTTP + JSON API, previews, render cache)
                 │                          │
                 │            scripts/server/ui/  (library · viewer · editor)
                 └──────────────────────────────────────────────────────────┘
```

## Engines

| | board | archify |
|---|---|---|
| Source | `scripts/lib/*.mjs` (korea100studio, unchanged geometry) | `engines/archify/` (vendored clean Skill package) |
| Document | `board-v1` (`title`, `lanes`, `stages`, `nodes`, `edges`) | `diagram_type` ∈ architecture/workflow/sequence/dataflow/lifecycle |
| Render | in-process → SVG string | child process `renderers/<type>/render-<type>.mjs` → HTML file |
| Validate | ajv (or built-in mirror) + referential integrity + layout/composition | `validate --json` (render + 9 artifact checks) |
| Deliver | write SVG (+PNG via rsvg/cairosvg/Chrome) | `deliver --json` (atomic commit + receipt) |

### Independence: engines are optional and replaceable

Archify is resolved at call time, in this order: `HANSOL_ARCHIFY_ROOT`
(authoritative; a broken path is reported, never silently skipped) → the
vendored `engines/archify` → a discovered stand-alone install
(`~/.claude/skills/archify`, `~/.agents/skills/archify`,
`~/.config/opencode/skills/archify`, `../archify/archify`). When none exists
the product runs in board-only mode: `archifyAvailable()` is false, render /
validate return one structured "engine not found" diagnostic, templates omit
Archify kinds, the UI shows "Board-only mode", and `doctor` lists the engine
as optional. Nothing in the board engine imports Archify, and nothing in
Archify knows about Hansol-100.

### Synergy: the converter

`scripts/lib/convert.mjs` maps between the two document models:

| board-v1 | Archify workflow (v2) |
|---|---|
| `lanes[]` (strings) | `lanes[{id,label}]` (ids allocated, labels kept) |
| `stages[]` (≤ 6, "columns" orientation) | `phases[{fromCol,toCol}]`, one column per stage; actors are lanes |
| `stages[]` (7–10, "rows" orientation) | `lanes[]`, one Archify lane per stage; actors become `phases`/columns (grouped into ≤ 6 with the actor in `tag`) |
| `nodes[].emphasis` lead/key/normal/bottleneck/loop | `nodes[].type` frontend/backend/external/security/messagebus + `meta.legend.entries` relabelled from the board profile |
| `nodes[].note`, `refs[0].source` | `sublabel`, `tag` |
| `edges[].type` sequence/message/loop | `variant`/`role` default / dashed+async / emphasis+return |

The Archify compiler enforces single-line node text (`textUnits × 6.8 ≤ width
+ 6`, sublabel/tag at a 6px minimum), ≥ 8px between same-lane nodes, and a
legend band below the lanes. The converter mirrors those rules: it fits node
widths (92–200px), shortens over-long text and records the full text in
`cards`, assigns symmetric `yOffset`s to nodes sharing a lane × column cell,
and gives return edges that jump back two or more columns `fromSide/toSide:
"top"` so automatic routing does not cross the legend. A visible
"Hansol-100 · conversion" card records orientation, profile, and the exact
stage/actor order (Archify schemas reject unknown `meta` fields, so a card is
the only schema-legal carrier), which makes the reverse direction lossless;
for hand-written workflows the reverse direction recovers stages from phases
(or synthesises `Step N`), emphasis from kinds, and edge types from
roles/direction. Both directions are validated by the
target engine in `tests/convert.test.mjs`, including a round trip.

`scripts/lib/detect.mjs` decides which engine a document belongs to and
produces the engine-neutral summary (title, lanes, stages, counts, searchable
text) used by the library and the UI. `scripts/lib/archify-engine.mjs` is the
only place that knows how to spawn Archify; it always sets
`ARCHIFY_UPDATE_CHECK_DISABLED=1` and asks the renderer for JSON diagnostics
(`ARCHIFY_DIAGNOSTIC_FORMAT=json`) so failures arrive as structured
`{code, message, subject, evidence, supportedFixes}` objects instead of stack
traces.

### Why vendor the clean package (and not the whole Archify repo)

- The clean package is what Archify itself distributes (`archify.zip`); it
  is zero-install and its correctness is certified upstream by the
  package-smoke gate. Hansol-100 re-runs the same class of checks in
  `tests/archify-engine.test.mjs`.
- Archify's full test-suite depends on repository-level scripts, docs,
  benchmarks and Chrome; carrying it would couple Hansol-100 to Archify's
  internals without adding assurance for the shipped engine.
- `scripts/sync-archify.mjs` uses Archify's own stager, so the vendored tree
  is byte-identical to upstream and `--check` can prove it.

## Library

A directory of `<id>.json` files. Ids are lowercase ASCII + Hangul
(`^[a-z0-9가-힣][a-z0-9가-힣._-]{0,79}$`), which keeps them filesystem- and
URL-safe while readable for Korean titles. The index is rebuilt from
`readdir` + `stat` on every request and re-parses only files whose mtime/size
changed, so edits by agents, people, and git all appear immediately without a
daemon. Each entry carries a `revision` (sha256 of the bytes) used for
optimistic concurrency: a `PUT` with a stale revision is refused with 409 and
the UI lets the user overwrite or reload. Deletes move files to `.trash/`.

Search normalises text (NFKC, lower-case), splits the query on whitespace, and
requires every token to appear as a substring in some field. Substring
matching is deliberate: it behaves well for Korean (no word boundaries between
morphemes), identifiers, and mixed-language names. Fields are weighted (title
10, subtitle 4, lanes/stages 3, nodes 2, edges 1.5, notes 1, ids 0.5) and the
matched snippets are returned so the UI can show *where* a hit came from.

## Service

`scripts/server/server.mjs` is a plain `node:http` server:

- `/` and `/assets/*` serve the UI with a CSP (`script-src 'self'`, no inline
  scripts). Archify HTML is therefore never inlined into the app page; it is
  served from `/api/diagrams/:id/render.html` or a short-lived
  `/api/preview/<token>.html` and shown in an iframe, so the Archify viewer
  keeps its own scripts and styles.
- Render endpoints carry ETags (revision + options) and answer 304, which
  keeps library thumbnails cheap. Archify HTML renders are cached in memory
  (LRU by content hash); server-side PNGs are cached in the OS temp directory.
- Request bodies are limited (4 MB) and drained before answering 413; ids and
  trash file names are validated before touching the filesystem.
- The server binds to 127.0.0.1 unless `--host` says otherwise. There is no
  authentication by design (team-internal tool); put it behind a reverse
  proxy if it must be exposed.

## UI

Vanilla ES modules, no build step: `app.js` (router, library, import, trash),
`viewer.js`, `editor.js`, `canvas.js` (zoomable sheet), `api.js`, `i18n.js`
(Korean/English), `util.js` (safe DOM builder, browser-side PNG export).
The editor keeps one in-memory document; the board form mutates it directly
and the JSON tab re-parses into it, so both views stay consistent and the
preview (debounced `POST /api/preview`) always reflects the current state.

## Extension points

- **New board profile** — add to `scripts/lib/profiles.mjs`
  (see `references/profiles.md`); the UI's profile select lists
  `default`/`gov`, extend it in `editor.js` if you add more.
- **New Archify version** — `node scripts/sync-archify.mjs --from <checkout>`,
  then `npm test`. If Archify adds a diagram type, extend
  `ARCHIFY_TYPES` in `scripts/lib/detect.mjs` and `ARCHIFY_TEMPLATE_FILES` in
  `scripts/lib/archify-engine.mjs`.
- **Other storage** — `Library` is the only module that touches the
  filesystem; the server and CLI talk to it through `list/get/save/remove`.
