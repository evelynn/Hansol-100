# korea100studio — Design Spec

> Status: draft for review · 2026-07-20

## 1. Purpose

A reusable **Agent Skill** that turns any process — described in natural
language, a table, or structured data — into a publication-quality **vertical
swimlane process board** (SVG/PNG), validates its composition quality, and can
render a stage-ordered reveal animation. It is the domain-agnostic extraction of
korea100's portrait process-board renderer, packaged the way
`fireworks-tech-graph` is: one `SKILL.md` entry point that works unchanged in
both **Claude Code** and **Codex**.

"korea100studio is to process/workflow boards what fireworks-tech-graph is to
architecture diagrams."

## 2. Non-goals (YAGNI for v1)

- Horizontal layouts (portrait/vertical only).
- Multiple visual themes (fireworks ships 12 styles; we ship one).
- GIF export / puppeteer / any headless-browser dependency.
- A web UI.
- Modifying the korea100 repo in v1. korea100's renderer stays exactly as-is
  until this skill is built and verified. The eventual migration is decided
  (**soft replace**, see §12) but sequenced as a gated **Phase 2**, not part of
  v1. In v1 korea100 is only a *reference example*, not a dependency.

## 3. Users & usage model

The consumer is an AI agent (Claude Code / Codex) acting for an end user.

1. User: "Draw the procurement approval process across requester, finance, and
   vendor." (or pastes existing data / a table)
2. Agent (guided by `SKILL.md`): produces a **board JSON** conforming to
   `schemas/board-v1.schema.json`.
3. Agent runs the CLI to render SVG (+PNG if a rasterizer exists), audits
   composition quality, and optionally renders motion.
4. If the audit flags budget breaches (node-piercings / crossings), the gutter
   router already mitigates most; the agent adjusts input or profile and
   re-checks. This is the fireworks-style **validate-render loop**.

## 4. Runtime & distribution

- **Pure Node.js**, zero native dependencies required to install.
- **SVG is always produced.** PNG is optional: emitted when `rsvg-convert` or
  `cairosvg` is detected on PATH (mirrors fireworks' optional-cairosvg model).
- Motion output is a **self-contained animated SVG** (SMIL, no JS, no deps).
- Distributed as a **standalone public repo** `korea100studio`, published as an
  npm package, installable via `npx skills add` or git checkout into
  `~/.claude/skills/` (Claude Code) or `~/.agents/skills/` (Codex).
- `agents/openai.yaml` supplies optional Codex UI metadata; `SKILL.md`
  front-matter (`name`, `description`) is the shared entry point.

## 5. Repository layout (Agent Skills format)

```
korea100studio/
  SKILL.md                       # entry point: name/description + agent instructions
  README.md  LICENSE  package.json
  agents/openai.yaml             # Codex metadata (no effect on Claude Code)
  schemas/
    board-v1.schema.json         # generic core schema (JSON Schema draft 2020-12)
  scripts/
    board.mjs                    # unified CLI (render|audit|validate|motion|check)
    lib/
      layout.mjs                 # lane×stage geometry engine
      render-svg.mjs             # SVG renderer (profile-driven)
      composition.mjs            # composition-quality metrics + gate + baseline
      motion.mjs                 # stage-order play schedule + animated SVG
      profiles.mjs               # profile presets (default + gov)
      rasterize.mjs              # optional SVG→PNG via detected rasterizer
  references/
    authoring.md                 # how the agent turns NL/data → board JSON
    composition-quality.md       # the metric budget & what each number means
    profiles.md                  # built-in profiles + how to define one
  templates/board.template.json  # starter board
  fixtures/
    generic-sample.json          # neutral-profile example
    gov-sample.json              # korea100-style example (gov profile)
    quality-baseline.json        # golden composition baseline for regression
  tests/*.test.mjs
```

## 6. Data contract (`board-v1`)

Generic core schema, domain-neutral:

```jsonc
{
  "schema_version": 1,
  "title": "…", "subtitle": "…",
  "profile": "default | gov",            // optional, default "default"
  "lanes": ["Requester", "Finance", "Vendor"],   // actor groups (ordered top→bottom bands)
  "stages": ["Intake", "Review", "Approve", "Close"], // ordered phases (rows top→bottom)
  "nodes": [
    { "id": "N1", "lane": "Requester", "stage": "Intake",
      "label": "Submit request",
      "emphasis": "lead | key | bottleneck | loop | normal",  // generic emphasis levels
      "refs": [{ "source": "Policy 3.1", "note": "…" }],       // generic citations (was legal_basis)
      "note": "optional caption" }
  ],
  "edges": [
    { "id": "E1", "source": "N1", "target": "N2",
      "type": "sequence | message | loop", "label": "optional" }
  ]
}
```

- **Profiles** map generic concepts onto rendering. `default` = neutral badges
  (lead/key/bottleneck/loop) + generic ref rendering. `gov` = korea100 flavor:
  badges 선행/핵심/병목/회귀, `refs` rendered as 조문, ordinance-purple accent,
  title overrides. All Korea-specific hardcoding (`TITLE_OVERRIDES`,
  `ORDINANCE_*`, `legal_basis` layout) lives **only** in the gov profile.
- A thin adapter maps a korea100 institution JSON → `board-v1` + `profile:gov`
  (shipped as `fixtures/gov-sample.json` + documented in `references/profiles.md`).

## 7. CLI surface (`scripts/board.mjs`)

```
board render   <board.json> [--out f.svg] [--png] [--profile gov]
board audit    <board.json>                 # composition score + metrics table
board validate <board.json> [--strict]      # gate; exit 1 on breach/render error
board motion   <board.json> [--out f.svg] [--embed]
board check    <file.svg>                    # post-render structural check
```

## 8. What is ported from korea100 (the real work)

Extract and **generalize** (copy, not move — korea100 untouched):

- `generate-process-article-image.mjs` → split into `lib/layout.mjs` (geometry:
  buildLayout, edgeRoute, orthogonalSegments — including the **gutter-routing
  fix** that cut node-piercings 552→287) and `lib/render-svg.mjs` (SVG
  assembly), with Korea-specific pieces lifted into `lib/profiles.mjs`.
- `lib/process-layout.mjs` → `lib/layout.mjs` (slot assignment).
- `lib/process-composition.mjs` → `lib/composition.mjs` (metrics, score, budget,
  baseline gate).
- `lib/process-motion.mjs` + `generate-process-motion.mjs` → `lib/motion.mjs`.
- `sharp` PNG path → `lib/rasterize.mjs` (optional rsvg/cairosvg detection).

The `lib/` modules MUST expose a stable **programmatic API** (not only the CLI),
so a consumer like korea100 can import the core while keeping its own wrapper:
`buildLayout(board, profile)`, `renderBoardSvg(board, { profile })` → SVG string,
`computeComposition(board, profile)`, `buildMotionSvg(board, profile)`. This is
what makes the Phase 2 soft replace (§12) possible without korea100 giving up
its batch/caching/PNG pipeline.

## 9. Testing

- Schema validation tests (valid/invalid boards).
- Render smoke test: fixtures render to well-formed SVG; `check` passes.
- Composition tests ported from korea100 (piercing detection, score monotonicity,
  budget gate) against `fixtures/`.
- Golden baseline: `fixtures/quality-baseline.json` + a regression gate test.
- Both profiles (`default`, `gov`) render the same fixture without error.

## 10. Success criteria

- Fresh checkout into `~/.claude/skills/` (and `~/.agents/skills/`), then a
  natural-language request produces a valid board SVG with 0 render errors.
- `gov` profile reproduces korea100's look on `gov-sample.json`.
- `default` profile renders a non-Korean example cleanly.
- All tests pass; SVG-only path works with zero native deps installed; PNG works
  when a rasterizer is present.

## 11. Open questions / later decisions

- npm package name / scope for publish (`korea100studio` vs scoped).
- How korea100 vendors the core in Phase 2 (npm dep vs git submodule vs vendored
  copy) — decided at Phase 2 start.

## 12. Phase 2 — soft replace of korea100's renderer (gated, later)

Decided approach for the eventual migration (Method B, soft): korea100 keeps its
own wrapper — batch loop, source-hash caching, `.process-image-manifest.json`,
`sharp` PNG export at 1800×2400 — and swaps only the geometry + SVG-assembly core
to import from korea100studio's programmatic API with `profile: gov`.

Sequence, each step gated by verification:

1. Build korea100studio v1 (this spec) and its tests, standalone.
2. Verify the `gov` profile reproduces korea100 on all 509 boards:
   - render every korea100 board through korea100studio (gov profile),
   - compare against korea100's current output — composition metrics must match
     the frozen baseline, and rendered SVG/PNG must be visually equivalent
     (pixel-diff tolerance) on a representative set.
3. Only if step 2 is clean: introduce a korea100 adapter
   (institution JSON → board-v1 + gov) and replace the body of
   `generate-process-article-image.mjs` with a call to
   `renderBoardSvg(...)`, keeping the wrapper/caching/sharp path.
4. Re-run korea100's full checks (`test:process-layout`, `test:process-warnings`,
   `validate:composition`, `baseline:composition`) + regenerate 509 PNGs and
   confirm no visual regression.
5. Delete korea100's now-duplicated geometry/render code.

Reversible at any step: until step 5, korea100's original renderer remains and
the swap is a single call-site change.
