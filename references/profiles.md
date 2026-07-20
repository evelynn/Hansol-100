# Profiles

A profile controls the visual language of a rendered board: badge labels,
colors, and all the surrounding chrome text (axis labels, legend, footer
notes). Profiles live in `scripts/lib/profiles.mjs` and are selected via
`--profile <name>` on the CLI, or the board's own `"profile"` field, falling
back to `default`.

## `default` vs `gov` vs `hansol`

### Emphasis → badge label

| `emphasis` | `default` badge | `gov` badge | `hansol` badge |
|---|---|---|---|
| `lead` | Lead | 선행 (leading) | 주관 (owns/initiates the step) |
| `key` | Key | 핵심 (core) | 핵심 (decisive step) |
| `normal` | Step | 후속 (follow-up) | 진행 (routine step) |
| `bottleneck` | Bottleneck | 병목 (bottleneck) | 지연 (delay-prone step) |
| `loop` | Loop | 회귀 (return) | 반려 (returned / rework) |

Each badge also carries a fill/border/ink/sub color set. `default` uses a
neutral blue/slate palette (`key` renders as solid dark slate,
`bottleneck` as amber, `loop` as indigo). `gov` uses korea100's Korean
government look: `key` is solid green (`#087452`), `bottleneck` is amber,
`loop` is blue, and the overall accent is violet (`#7c3aed`, vs. `default`'s
blue `#2563eb`).

`hansol` is the Hansol corporate profile: a Korean business-process look with
approval-flow badges. `key` renders as solid corporate blue (`#0f4c81`, also
the accent), `bottleneck`/지연 is amber, and `loop`/반려 is red (`#d1434b`) to
read as a returned/rejected approval. All chrome text is company-oriented —
`부서·담당` instead of actors — and `refsLabel` is `근거` for citing internal
사규·지침 (규정·전결규정 등) rather than statutes.

### `refsLabel`

The heading shown above a node's `refs[]` citations in the rendered card.
`default` uses `"Refs"`; `gov` uses `"조문"` (statute article); `hansol` uses
`"근거"` (internal rule/basis). Set this when adding a profile for a different
citation convention (e.g. `"Sources"`).

### Chrome text (`labels`)

Everything else the renderer draws that isn't node/edge content is pulled
from `profile.labels`, so a profile can fully localize the UI instead of
just the palette:

- `stageAxis`, `actorAxis` — axis captions (e.g. `"Stage ↓"` / `"단계 ↓"`).
- `legendTitle` — heading over the emphasis legend.
- `sequenceLabel`, `messageLabel`, `loopLabel` — legend entries for each edge
  type.
- `statsTemplate` — e.g. `"{nodes} nodes · {lanes} lanes · {stages} stages"`.
  `{nodes}`/`{lanes}`/`{stages}`/`{edges}`/`{groups}` are substituted by the
  renderer.
- `groupingNoteTemplate` — explains when actor lanes were merged into fewer
  layout groups for space.
- `readingNote` — one-line instruction on how to read the grid.
- `sourceNote` — disclaimer/provenance line footer.
- `creditLine` — attribution line; intentionally blank in both shipped
  profiles (brand credit isn't a language choice, so it isn't auto-applied).

### Other fields

- `accent` — a single accent color used for chrome (not node badges).
- `titleOverrides` — optional lane-title rewrites used when lanes are merged
  into layout groups (passed through to `buildProcessLaneGroups` in
  `scripts/lib/layout.mjs`); empty in both shipped profiles.

## Adding a new profile

Edit `scripts/lib/profiles.mjs`:

1. Add a new object (copy `DEFAULT` or `GOV` as a starting point) with the
   same shape: `status` (all five `EMPHASIS_KEYS`, each with
   `label`/`fill`/`border`/`ink`/`sub`), `refsLabel`, `accent`,
   `titleOverrides`, and a full `labels` block (all the chrome-text keys
   above — every one is required, since the renderer doesn't have separate
   English fallbacks per key).
2. Register it in the `PROFILES` map:
   ```js
   const PROFILES = { default: DEFAULT, gov: GOV, hansol: HANSOL, yourProfile: YOUR_PROFILE };
   ```
3. Use it via `--profile yourProfile` on any CLI command, or set
   `"profile": "yourProfile"` in the board JSON.

`getProfile(name)` falls back to `DEFAULT` for unknown names, so a typo in
`--profile` silently renders with default styling rather than erroring —
double-check the name if a new profile doesn't seem to apply.
