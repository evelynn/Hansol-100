# The studio service

```bash
node bin/hansol.mjs serve [--port 4100] [--host 127.0.0.1] [--library DIR] [--open] [--quiet]
# environment: HANSOL_PORT, HANSOL_HOST, HANSOL_LIBRARY, HANSOL_CHROME (server-side PNG)
```

Loopback only by default. `--host 0.0.0.0` shares it on the network; there is
no authentication, so treat it as a team-internal tool.

## Using the web app

- **Library** (`#/`) — search box (all terms must match; Korean substrings
  work), kind chips, sort, cards with live thumbnails. Card actions: view,
  edit, duplicate, delete (to trash).
- **Viewer** (`#/view/<id>`) — boards: fit width / fit page / actual size /
  zoom, Board and Motion tabs; Archify: the interactive Archify viewer in an
  iframe (`?` guide, `/` search, `T` theme, `E` export inside it) plus
  “Open in new tab”. Side panel: info, lanes, stages, composition metrics
  (boards) or “Run Archify validation” (Archify), export buttons.
- **Editor** (`#/edit/<id>`, `#/new/<template>`) — left: Form (boards) / JSON
  tabs; right: live preview with status and composition chips, and the error
  or validation panel. `Ctrl/⌘+S` saves. Saving an invalid document asks
  whether to keep it as a draft; a stale revision asks whether to overwrite
  or reload. “Save as” stores a copy under a new id; “Revert” reloads the
  last saved state.
- **New** — templates: `board` (English starter), `board-ko` (Korean starter,
  gov profile), and one example per Archify type.
- **Import** (`#/import`) — paste JSON or pick a file; the kind is detected
  and the editor opens.
- **Trash** (`#/trash`) — restore deleted diagrams.
- Language toggle (top right) switches Korean/English and is remembered.

## JSON API

All responses are JSON unless noted. Errors look like
`{"error": {"code": "…", "message": "…", "details": {…}}}`.

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Version, engines (Archify version + upstream commit), rasterizer, library stats |
| `GET /api/diagrams?q=&kind=&engine=&profile=&sort=updated\|title&limit=&offset=` | List/search; `q` adds `score` and `matches[{field,text}]` per item. `GET /api/search` is an alias |
| `POST /api/diagrams` `{id?, source, allowInvalid?}` | Create; `id` defaults to a slug of the title. 409 `exists`, 422 `invalid-document` unless `allowInvalid` |
| `GET /api/diagrams/:id` | Summary + `source` + `revision` |
| `PUT /api/diagrams/:id` `{source, revision?, force?, allowInvalid?}` | Update; 409 `conflict` when `revision` is stale (unless `force`) |
| `DELETE /api/diagrams/:id` | Move to `.trash/` |
| `POST /api/diagrams/:id/duplicate` `{id?}` | Copy |
| `GET /api/diagrams/:id/source.json[?download=1]` | Raw JSON |
| `GET /api/diagrams/:id/render.svg[?profile=gov][&download=1]` | Board SVG (ETag) |
| `GET /api/diagrams/:id/motion.svg` | Board stage-reveal motion SVG |
| `GET /api/diagrams/:id/render.png[?width=1800]` | Board PNG (501 when no server-side rasterizer; the UI renders PNG in the browser instead) |
| `GET /api/diagrams/:id/render.html[?quality=showcase]` | Archify standalone HTML (ETag) |
| `GET /api/diagrams/:id/audit[?profile=][&quality=]` | Board composition metrics or the Archify `validate --json` receipt |
| `POST /api/preview` `{source, profile?, quality?}` | Render an unsaved document: boards → `{ok, svg, audit, errors}`; Archify → `{ok, previewUrl}` (open within 15 min) or `{ok:false, diagnostics}` |
| `POST /api/validate` `{source, thorough?, quality?}` | Engine-neutral validation; Archify runs the full receipt unless `thorough:false` |
| `GET /api/templates`, `GET /api/templates/:name` | Starters for both engines |
| `GET /api/trash`, `POST /api/trash/:file/restore` | Trash listing and restore |

### Examples

```bash
# push a board an agent just authored
curl -s -X POST http://127.0.0.1:4100/api/diagrams \
  -H 'content-type: application/json' \
  -d "{\"id\":\"permit-approval\",\"source\":$(cat permit.json)}"

# search
curl -s 'http://127.0.0.1:4100/api/diagrams?q=%EC%8B%AC%ED%8C%90' | jq '.items[] | {id, title, matches}'

# render without saving
curl -s -X POST http://127.0.0.1:4100/api/preview -H 'content-type: application/json' \
  -d "{\"source\":$(cat permit.json)}" | jq '{ok, audit}'

# download the SVG of a stored board
curl -s 'http://127.0.0.1:4100/api/diagrams/permit-approval/render.svg?download=1' -o permit.svg
```

The CLI's `library` subcommands operate on the same folder without the server
running (`node bin/hansol.mjs library add permit.json`).
